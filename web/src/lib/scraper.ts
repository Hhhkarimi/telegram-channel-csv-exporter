import type { Post, FetchOptions } from '@/types/post';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩';
const LATIN_DIGITS = '01234567890123456789';
const DIGIT_MAP: Record<string, string> = {};
for (let i = 0; i < PERSIAN_DIGITS.length; i++) {
  DIGIT_MAP[PERSIAN_DIGITS[i]] = LATIN_DIGITS[i];
}

// Convert Persian/Arabic digits to Latin
export function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] || d);
}

// Normalize channel name from URL or handle
export function normalizeChannel(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Match t.me URLs or tgstat URLs
  const urlMatch = trimmed.match(
    /(?:t\.me\/(?:s\/)?|tgstat\.\w+\/channel\/@?)([A-Za-z0-9_]+)/i
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  // Remove @ prefix if present
  return trimmed.replace(/^@/, '');
}

// Validate date format YYYY-MM-DD
export function isValidDate(s: string): boolean {
  if (!s) return false;
  const normalized = normalizeDigits(s).replace(/[\/.]/g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

// Parse view counts like "12.3K" or "1.1M"
export function parseViews(s: string | null | undefined): number | null {
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

// Create logger
export function createLogger(onLog: FetchOptions['onLog']) {
  return (source: string, message: string) => {
    if (onLog) onLog(source as any, message);
    else console.log(`[${source}] ${message}`);
  };
}

// Fetch with retry logic
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  delay: number = 1000,
  useProxy: boolean = false
): Promise<Response> {
  let lastError: Error | null = null;

  // A common public CORS proxy. For production, use a dedicated one.
  const PROXY_URL = 'https://corsproxy.io/?';

  const targetUrl = useProxy ? `${PROXY_URL}${encodeURIComponent(url)}` : url;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(targetUrl, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers,
        },
      });
      if (response.status === 200) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (e: any) {
      lastError = e;
    }
    // Exponential backoff
    await new Promise((r) => setTimeout(r, delay * (attempt + 1) * 2));
  }
  throw lastError || new Error('Fetch failed');
}

// Detect captcha in HTML
export function detectCaptcha(html: string): boolean {
  const lower = html.toLowerCase();
  if (lower.includes('captcha')) return true;
  if (lower.includes('cloudflare') && lower.includes('challenge')) return true;
  return false;
}

// Parse HTML string into a DOM document
export function parseHTML(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// Date helpers
export function toUTCDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const normalized = normalizeDigits(dateStr).replace(/[\/.]/g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  return new Date(Date.UTC(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10)
  ));
}

export function endOfDay(dateStr: string): Date | null {
  const d = toUTCDate(dateStr);
  if (!d) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// Export utility functions for use in scraper modules
export { Post };

// Re-export fetchers from separate modules for backwards compatibility
export { fetchTme } from './fetchers/tme';
export { fetchTgstat } from './fetchers/tgstat';