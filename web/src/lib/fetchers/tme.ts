import type { Post } from '@/types/post';
import { fetchWithRetry, parseHTML, fetchWithRetry as _unused } from '../scraper';

// Sleep helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FetchTmeOptions {
  channel: string;
  dateFrom?: Date;
  dateTo?: Date;
  delay?: number;
  maxPages?: number;
  onLog?: (source: string, msg: string) => void;
  onProgress?: (count: number) => void;
}

export async function fetchTme(options: FetchTmeOptions): Promise<Post[]> {
  const { channel, dateFrom, dateTo, delay = 1.0, maxPages = 2000, onLog } = options;
  const log = onLog || (() => {});
  const posts: Map<number, Post> = new Map();
  let before: number | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`https://t.me/s/${channel}`);
    if (before !== null) {
      url.searchParams.set('before', before.toString());
    }

    let response: Response;
    try {
      response = await fetchWithRetry(url.toString(), {}, 3, 1000, true);
    } catch (e: any) {
      throw new Error(`t.me request failed: ${e.message}`);
    }

    const html = await response.text();
    const doc = parseHTML(html);
    const messages = doc.querySelectorAll<HTMLElement>('div.tgme_widget_message[data-post]');

    if (messages.length === 0) {
      if (page === 0) {
        throw new Error('No posts found. The channel may be private, restricted, or the username is wrong.');
      }
      break;
    }

    let minId: number | null = null;
    let reachedOlder = false;

    for (const msg of messages) {
      const dataPost = msg.getAttribute('data-post');
      if (!dataPost) continue;
      const msgId = parseInt(dataPost.split('/').pop() || '0', 10);
      if (!msgId) continue;
      if (minId === null || msgId < minId) minId = msgId;

      const timeEl = msg.querySelector<HTMLElement>('time[datetime]');
      if (!timeEl) continue;
      const dtStr = timeEl.getAttribute('datetime');
      if (!dtStr) continue;
      const dt = new Date(dtStr);
      if (isNaN(dt.getTime())) continue;
      const dtUtc = new Date(dt.toISOString());

      // Filter by date range
      if (dateFrom && dtUtc < dateFrom) {
        reachedOlder = true;
        continue;
      }
      if (dateTo && dtUtc > dateTo) continue;

      // Actual message text — preserve Telegram's native HTML structure (<br>, <b>, <i>, <a>, emoji spans).
      // Telegram sanitizes this markup itself (no scripts/handlers), so rendering it directly keeps the
      // genuine formatting (line breaks, bold/italic, inline links) without lossy text reconstruction.
      const textEl = msg.querySelector<HTMLElement>('.tgme_widget_message_text.js-message_text');
      let text = '';
      if (textEl) {
        const clone = textEl.cloneNode(true) as HTMLElement;
        // Drop inherited styling/anchors that don't belong in our stripped view
        clone.classList.remove('tgme_widget_message_text', 'js-message_text');
        text = clone.innerHTML.trim();
      }

      const viewsEl = msg.querySelector<HTMLElement>('.tgme_widget_message_views');
      const viewsStr = viewsEl ? viewsEl.innerText.trim() : '';
      const views = parseViewsSafe(viewsStr);

      // Forwarded detection
      const fwdEl = msg.querySelector<HTMLElement>(
        '.tgme_widget_message_forwarded_from_name, .tgme_widget_message_forwarded_from a, .tgme_widget_message_forwarded_from span'
      );
      let is_forwarded = 0;
      let forwarded_from = '';
      let forwarded_from_link = '';
      if (fwdEl) {
        is_forwarded = 1;
        forwarded_from = fwdEl.innerText.trim();
        if (fwdEl.tagName === 'A') {
          forwarded_from_link = fwdEl.getAttribute('href') || '';
        }
      }

      // Reply detection - find the reply anchor with correct classnames
      const replyEl = msg.querySelector<HTMLElement>('.tgme_widget_message_reply');
      let reply_to_text = '';
      let reply_to_link = '';
      if (replyEl) {
        const replyLinkEl = replyEl.querySelector<HTMLAnchorElement>('a.tgme_widget_message_reply');
        if (replyLinkEl) {
          reply_to_link = replyLinkEl.getAttribute('href') || '';
          // Get the precise reply text from the embedded div
          const replyTextEl = replyLinkEl.querySelector<HTMLElement>('.js-message_reply_text');
          reply_to_text = replyTextEl ? replyTextEl.innerText.trim() : replyLinkEl.innerText.trim();
        } else {
          reply_to_text = replyEl.innerText.trim();
        }
      }

      // Media detection
      const photoEl = msg.querySelector<HTMLElement>('.tgme_widget_message_photo');
      const videoEl = msg.querySelector<HTMLElement>('.tgme_widget_message_video');
      const audioEl = msg.querySelector<HTMLElement>('.tgme_widget_message_audio');
      const docEl = msg.querySelector<HTMLElement>('.tgme_widget_message_document');

      let media_type = '';
      let media_url = '';

      if (photoEl) {
        media_type = 'photo';
        const img = photoEl.querySelector<HTMLImageElement>('img');
        media_url = img ? img.getAttribute('src') || '' : '';
      } else if (videoEl) {
        media_type = 'video';
        const video = videoEl.querySelector<HTMLVideoElement>('video');
        media_url = video ? video.getAttribute('src') || '' : '';
      } else if (audioEl) {
        media_type = 'audio';
        const audio = audioEl.querySelector<HTMLAudioElement>('audio');
        media_url = audio ? audio.getAttribute('src') || '' : '';
      } else if (docEl) {
        media_type = 'document';
      }

      posts.set(msgId, {
        message_id: msgId,
        datetime_utc: formatDateTime(dtUtc),
        text,
        views: views !== null ? views : '',
        is_forwarded,
        forwarded_from,
        forwarded_from_link,
        forwards: '',
        link: `https://t.me/${channel}/${msgId}`,
        reply_to_text,
        reply_to_link,
        media_type,
        media_url,
      });
    }

    log('tme', `Page ${page + 1}: collected ${posts.size} posts so far...`);
    if (options.onProgress) options.onProgress(posts.size);

    if (reachedOlder || minId === null || minId <= 1 || before === minId) {
      break;
    }
    before = minId;
    await sleep(delay * 1000);
  }

  return Array.from(posts.values()).sort((a, b) => a.message_id - b.message_id);
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