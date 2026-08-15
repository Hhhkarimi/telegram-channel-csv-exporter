import type { Post } from '@/types/post';
import { fetchWithRetry, parseHTML, detectCaptcha, normalizeDigits } from '../scraper';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FetchTgstatOptions {
  channel: string;
  dateFrom?: Date;
  dateTo?: Date;
  domain?: string;
  delay?: number;
  maxPages?: number;
  onLog?: (source: string, msg: string) => void;
  onProgress?: (count: number) => void;
}

interface TgstatPost {
  message_id: number;
  datetime: Date | null;
  text: string;
  views: number | string;
  is_forwarded: number;
  forwarded_from: string;
  forwarded_from_link: string;
  forwards: number | string;
  link: string;
}

export async function fetchTgstat(options: FetchTgstatOptions): Promise<Post[]> {
  const {
    channel,
    dateFrom,
    dateTo,
    domain = 'tgstat.com',
    delay = 2.0,
    maxPages = 300,
    onLog,
  } = options;
  const log = onLog || (() => {});

  const sessionCookies = new Map<string, string>();
  const base = `https://${domain}/channel/@${channel}`;

  // Fetch initial page
  let response: Response;
  try {
    response = await fetchWithRetry(base, {}, 3, 1000, true);
  } catch (e: any) {
    throw new Error(`tgstat request failed: ${e.message}`);
  }

  // Capture cookies from response
  captureCookies(response, sessionCookies);

  const html = await response.text();
  if (detectCaptcha(html)) {
    throw new Error('tgstat is asking for a captcha (bot protection)');
  }

  const doc = parseHTML(html);
  const collected: Map<number, TgstatPost> = new Map(parseTgstatPosts(doc, channel));

  if (collected.size === 0) {
    throw new Error('Could not parse any posts from the tgstat page');
  }

  let covered = false;
  let exhausted = false;

  for (let page = 1; page < maxPages; page++) {
    const dated = Array.from(collected.values()).filter((p) => p.datetime);
    if (dated.length > 0 && dateFrom && dated.every((p) => p.datetime! >= dateFrom)) {
      // Check if we went past dateFrom
      const min = dated.reduce((m, p) => (p.datetime! < m ? p.datetime! : m), dated[0].datetime!);
      if (min < dateFrom) {
        covered = true;
        break;
      }
    }

    const oldestId = Math.min(...collected.keys());

    try {
      const r = await fetchWithRetry(
        `${base}/posts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: base,
          },
          body: new URLSearchParams({
            page: page.toString(),
            before: oldestId.toString(),
            q: '',
            _tgstat_csrk: sessionCookies.get('_tgstat_csrk') || '',
          }).toString(),
        },
        2,
        1000,
        true
      );
      captureCookies(r, sessionCookies);

      const payload = await r.json();
      const newHtml = payload?.html || '';
      if (!newHtml.trim()) {
        exhausted = true;
        break;
      }

      const newPosts = parseTgstatPosts(parseHTML(newHtml), channel);
      const before = collected.size;
      for (const [id, post] of newPosts) {
        collected.set(id, post);
      }
      log('tgstat', `Page ${page}: collected ${collected.size} posts so far...`);
      if (options.onProgress) options.onProgress(collected.size);

      if (collected.size === before) {
        exhausted = true;
        break;
      }
    } catch (e) {
      break;
    }

    await sleep(delay * 1000);
  }

  if (!covered && !exhausted) {
    throw new Error('tgstat only returned its first page (load-more blocked); coverage incomplete');
  }

  // Filter by date range and convert to Post format
  const posts: Post[] = [];
  const sorted = Array.from(collected.values()).sort((a, b) => a.message_id - b.message_id);
  for (const p of sorted) {
    if (!p.datetime) continue;
    if (dateFrom && p.datetime < dateFrom) continue;
    if (dateTo && p.datetime > dateTo) continue;
    posts.push({
      message_id: p.message_id,
      datetime_utc: formatDateTime(p.datetime),
      text: p.text,
      views: p.views,
      is_forwarded: p.is_forwarded,
      forwarded_from: p.forwarded_from,
      forwarded_from_link: p.forwarded_from_link,
      forwards: p.forwards,
      link: p.link,
    });
  }

  if (posts.length === 0) {
    throw new Error('tgstat parsing yielded no posts inside the date range');
  }

  return posts;
}

function captureCookies(response: Response, jar: Map<string, string>): void {
  // Read cookies from response headers (Set-Cookie)
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const cookies = setCookie.split(/,(?=\s*[\w_-]+=)/);
    for (const c of cookies) {
      const [kv] = c.split(';');
      const [key, ...rest] = kv.split('=');
      if (key) {
        jar.set(key.trim(), rest.join('=').trim());
      }
    }
  }
}

function parseTgstatPosts(doc: Document, channel: string): Map<number, TgstatPost> {
  const out = new Map<number, TgstatPost>();
  const cards = doc.querySelectorAll<HTMLElement>('div.post-container, div[id^="post-"]');

  for (const card of cards) {
    let msgId: number | null = null;

    // Try to find message ID from link
    const linkEl =
      card.querySelector<HTMLAnchorElement>(`a[href*="t.me/${channel}/"]`) ||
      card.querySelector<HTMLAnchorElement>(`a[href*="/channel/@${channel}/"]`);
    if (linkEl) {
      const m = /\/(\d+)(?:\D|$)/.exec(linkEl.getAttribute('href') || '');
      if (m) msgId = parseInt(m[1], 10);
    }

    if (msgId === null) {
      const idAttr = card.id || '';
      const m = /post-(\d+)/.exec(idAttr);
      if (m) msgId = parseInt(m[1], 10);
    }

    if (msgId === null) continue;

    // Parse date
    let dt: Date | null = null;
    const dateEls = card.querySelectorAll<HTMLElement>('small, .text-muted');
    for (const el of dateEls) {
      dt = parseTgstatDate(el.innerText.trim());
      if (dt) break;
    }

    // Parse text
    const textEl = card.querySelector<HTMLElement>('.post-text, .post-body, .text');
    const text = (textEl?.innerText || card.innerText || '').trim();

    // Parse views
    let views: number | string = '';
    const viewsNode = Array.from(card.querySelectorAll<HTMLElement>('*')).find(
      (e) => /views/i.test(e.childNodes[0]?.textContent || '')
    );
    if (viewsNode) {
      const match = /([\d.,]+\s*[KkMm]?)/.exec(viewsNode.innerText);
      if (match) views = parseViewsSafe(match[1]) ?? '';
    } else {
      const viewsEl = card.querySelector<HTMLElement>('.post-views, [data-views]');
      if (viewsEl) {
        const v = parseViewsSafe(viewsEl.innerText.trim());
        if (v !== null) views = v;
      }
    }

    // Forwarded detection
    const fwdMatch = /forwarded\s+from|репост|بازارسال/i.exec(card.innerText);
    let is_forwarded = 0;
    let forwarded_from = '';
    let forwarded_from_link = '';
    if (fwdMatch) {
      is_forwarded = 1;
      const a = card.querySelector<HTMLAnchorElement>('a');
      if (a) {
        forwarded_from = a.innerText.trim();
        forwarded_from_link = a.getAttribute('href') || '';
      } else {
        forwarded_from = card.innerText.replace(/forwarded\s+from/i, '').trim();
      }
    }

    // Shares/forwards
    const sharesNode = Array.from(card.querySelectorAll<HTMLElement>('*')).find(
      (e) => /shares?|forwards?/i.test(e.childNodes[0]?.textContent || '')
    );
    let forwards: number | string = '';
    if (sharesNode) {
      const match = /([\d.,]+\s*[KkMm]?)/.exec(sharesNode.innerText);
      if (match) forwards = parseViewsSafe(match[1]) ?? '';
    } else {
      const sharesEl = card.querySelector<HTMLElement>('.post-shares, [data-shares], .post-forwards');
      if (sharesEl) {
        const v = parseViewsSafe(sharesEl.innerText.trim());
        if (v !== null) forwards = v;
      }
    }

    out.set(msgId, {
      message_id: msgId,
      datetime: dt,
      text,
      views,
      is_forwarded,
      forwarded_from,
      forwarded_from_link,
      forwards,
      link: `https://t.me/${channel}/${msgId}`,
    });
  }

  return out;
}

function parseTgstatDate(text: string): Date | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const formats = ['%d %b %Y, %H:%M', '%d %b, %H:%M', '%d.%m.%Y %H:%M', '%d.%m.%Y'];

  const now = new Date();
  for (const fmt of formats) {
    try {
      // Use a fallback parser for various formats
      const dd = normalizeDigits(cleaned);
      const year = /(\d{4})/.exec(dd)?.[1];
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };

      if (fmt === '%d %b %Y, %H:%M') {
        const m = /^(\d{1,2})\s+(\w{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})$/.exec(dd);
        if (m) {
          const mo = monthMap[m[2]];
          if (mo !== undefined) {
            return new Date(Date.UTC(+m[3], mo, +m[1], +m[4], +m[5]));
          }
        }
      } else if (fmt === '%d %b, %H:%M') {
        const m = /^(\d{1,2})\s+(\w{3}),\s*(\d{1,2}):(\d{2})$/.exec(dd);
        if (m) {
          const mo = monthMap[m[2]];
          if (mo !== undefined) {
            let yr = now.getUTCFullYear();
            const d = new Date(Date.UTC(yr, mo, +m[1], +m[3], +m[4]));
            if (d.getTime() > now.getTime() + 86400000) {
              d.setUTCFullYear(yr - 1);
            }
            return d;
          }
        }
      } else if (fmt === '%d.%m.%Y %H:%M') {
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(dd);
        if (m) {
          return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]));
        }
      } else if (fmt === '%d.%m.%Y') {
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(dd);
        if (m) {
          return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
        }
      }
    } catch {}
  }

  return null;
}

function parseViewsSafe(s: string): number | null {
  if (!s) return null;
  const cleaned = s.trim().replace(/,/g, '').replace(/\s/g, '');
  const match = /^([\d.]+)([KkMm]?)$/.exec(cleaned);
  if (!match) return null;
  let val = parseFloat(match[1]);
  const suf = match[2].toLowerCase();
  if (suf === 'k') val *= 1000;
  else if (suf === 'm') val *= 1000000;
  return Math.floor(val);
}

function formatDateTime(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}