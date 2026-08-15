// Check if text direction should be RTL (Right-to-Left) for proper rendering
export function isRTL(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // Check for Arabic, Persian, Hebrew, or other RTL characters
  const rtlChars = /[֑-߿יִ-﷽ﹰ-ﻼ]/;
  return rtlChars.test(text.trim());
}

// Convert Gregorian ISO string to Shamsi (Jalali) date using browser locale
export function formatShamsi(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
}