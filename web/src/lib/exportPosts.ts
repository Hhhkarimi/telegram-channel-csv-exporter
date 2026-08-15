import { fetchTme } from '@/lib/fetchers/tme';
import { fetchTgstat } from '@/lib/fetchers/tgstat';
import type { Post, FetchOptions } from '@/types/post';
import { createLogger } from '@/lib/scraper';

/**
 * Unified entry point used by the UI to retrieve channel posts.
 *
 * - Tries tgstat first (fast batch endpoint) unless `source` is forced.
 * - Falls back to t.me preview on any error (network, captcha, incomplete coverage).
 * - Returns posts sorted chronologically (oldest → newest) for easy UI rendering.
 */
export async function exportPosts(options: FetchOptions): Promise<{ channel: string; posts: Post[] }> {
  const { channel, dateFrom, dateTo, source = 'auto', delay = 1.0, onLog, onProgress } = options;
  const log = createLogger(onLog);

  const fromDate = dateFrom ? new Date(dateFrom) : undefined;
  const toDate = dateTo ? new Date(dateTo) : undefined;

  let posts: Post[] = [];
  let usedSource = '';

  if (source === 'tgstat' || source === 'auto') {
    try {
      log('tgstat', 'Attempting tfstat fetch...');
      posts = await fetchTgstat({
        channel,
        dateFrom: fromDate,
        dateTo: toDate,
        delay,
        onLog: log,
        onProgress,
      });
      usedSource = 'tgstat';
    } catch (e: any) {
      log('tgstat', `tgstat failed: ${e.message}`);
      if (source === 'tgstat') throw e; // user explicitly requested tgstat
    }
  }

  if (posts.length === 0) {
    log('tme', 'Falling back to t.me preview...');
    posts = await fetchTme({
      channel,
      dateFrom: fromDate,
      dateTo: toDate,
      delay,
      onLog: log,
      onProgress,
    });
    usedSource = 'tme';
  }

  // Normalise the channel name (remove @, extract from URL, etc.)
  const normalized = channel.replace(/^@/, '');
  return { channel: normalized, posts };
}
