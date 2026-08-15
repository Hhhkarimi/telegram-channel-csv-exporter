export interface Post {
  message_id: number;
  datetime_utc: string;
  text: string;
  views: number | string;
  is_forwarded: number | boolean;
  forwarded_from: string;
  forwarded_from_link: string;
  forwards: number | string;
  link: string;
  reply_to_text?: string;
  reply_to_link?: string;
  media_type?: string;
  media_url?: string;
}

export interface FetchOptions {
  channel: string;
  dateFrom?: string;
  dateTo?: string;
  source?: 'tgstat' | 'tme' | 'auto';
  delay?: number;
  onLog?: (source: string, message: string) => void;
  onProgress?: (count: number) => void;
}

export type LogSource = 'tgstat' | 'tme' | 'system' | 'error';