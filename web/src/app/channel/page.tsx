'use client';

import { useEffect, useState, Suspense } from 'react';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Post } from '@/types/post';
import { exportPosts } from '@/lib/exportPosts';
import { ArrowLeft, Download, Loader2, RefreshCcw, MessageSquare, Info, Image as ImageIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { isRTL, formatShamsi } from '@/lib/utils';
import Image from 'next/image';

// Render Telegram's native HTML directly. The scraper stores innerHTML (sanitized by Telegram,
// no scripts/handlers), so we keep <br>, <b>, <i>, <a>, and emoji spans intact — preserving the
// genuine line-break spacing and inline formatting instead of approximating it with <p> tags.
function MessageContent({ text }: { text: string }) {
  if (!text) return null;
  // Split the HTML string at the <br> boundaries, preserving the <br> tags in the array.
  // This allows us to wrap each text segment in a <div> with correct dir attribute
  // while keeping the exact number of line breaks.
  const segments = text.split(/(<br\s*\/?>)/gi);

  return (
    <div className="message-content-container">
      {segments.map((segment, idx) => {
        // If it's a <br> tag, render it as a <span> to avoid React.Fragment error
        if (segment.toLowerCase().startsWith('<br')) {
          return <span key={idx} dangerouslySetInnerHTML={{ __html: segment }} />;
        }
        // If it's an empty string (from consecutive <br>s), render nothing
        if (segment.trim() === '') {
          return <React.Fragment key={idx} />;
        }
        // Otherwise, wrap the segment in a <div> with the correct direction
        return (
          <div
            key={idx}
            dir={isRTL(segment) ? 'rtl' : 'ltr'}
            className="break-words"
            dangerouslySetInnerHTML={{ __html: segment }}
          />
        );
      })}
    </div>
  );
}

// Media display component for messages with photos/videos
function MessageMedia({ media_url, media_type }: { media_url?: string; media_type: string }) {
  if (!media_type) return null;

  // Render a simple placeholder rectangle indicating the presence of media.
  // This avoids loading external media while still preserving layout space.
  const label = media_type.charAt(0).toUpperCase() + media_type.slice(1);
  return (
    <div className="media-placeholder">
      {label} media (not displayed)
    </div>
  );
}

export default function ChannelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin text-primary" size={48} /></div>}>
      <ChannelContent />
    </Suspense>
  );
}

function ChannelContent() {
  const router = useRouter();
  const search = useSearchParams();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const dateFrom = search.get('from') || undefined;
  const dateTo = search.get('to') || undefined;
  const channel = search.get('channel') || '';

  const appendLog = (src: string, msg: string) => {
    setLogLines((prev) => [...prev.slice(-49), `[${src}] ${msg}`]);
  };

  const fetchData = async () => {
    if (!channel) {
      setError('No channel specified');
      setLoading(false);
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    setError('');
    setLogLines([]);
    try {
      const { posts: fetched } = await exportPosts({
        channel,
        dateFrom,
        dateTo,
        source: 'auto',
        onLog: appendLog,
      });
      setPosts(fetched);
    } catch (e: any) {
      setError(e.message || 'Unexpected error');
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [channel, dateFrom, dateTo]);

  const downloadCSV = () => {
    const header = [
      'message_id',
      'datetime_utc',
      'text',
      'views',
      'is_forwarded',
      'forwarded_from',
      'forwarded_from_link',
      'forwards',
      'link',
    ];
    const rows = posts.map((p) => header.map((h) => JSON.stringify((p as any)[h] ?? '')).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHTML = () => {
    const doc = new DOMParser().parseFromString('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Telegram Export</title></head><body></body></html>', 'text/html');
    const body = doc.body;
    const style = doc.createElement('style');
    style.textContent = `
      body { font-family: system-ui, sans-serif; background: #fff; color: #000; margin: 2rem; line-height: 1.5; }
      .msg { margin-bottom: 2rem; padding: 1rem; border-bottom: 1px solid #eee; }
      .meta { font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; }
      .text { white-space: pre-wrap; word-break: break-word; }
      .link { color: #2563eb; text-decoration: none; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #f8fafc; }
        .msg { border-color: #1e293b; }
      }
    `;
    doc.head.appendChild(style);
    const title = doc.createElement('h1');
    title.textContent = `Channel @${channel}`;
    body.appendChild(title);
    posts.forEach((p) => {
      const div = doc.createElement('div');
      div.className = 'msg';
      const meta = doc.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${p.datetime_utc} — ${p.views ? p.views + ' views' : ''}`;
      const txt = doc.createElement('div');
      txt.className = 'text';
      txt.innerHTML = p.text; // Now using HTML since scraper provides it
      div.appendChild(meta);
      div.appendChild(txt);
      if (p.link) {
        const a = doc.createElement('a');
        a.href = p.link;
        a.className = 'link';
        a.textContent = 'View on Telegram';
        div.appendChild(a);
      }
      body.appendChild(div);
    });
    const htmlStr = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    const blob = new Blob([htmlStr], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel}_export.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const back = () => router.push('/');

  return (
    <main className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <header className="flex items-center justify-between mb-6">
        <button onClick={back} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} /> Back
        </button>
        <ThemeToggle />
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={48} />
          <p className="mt-4 text-muted-foreground animate-pulse">Fetching channel history...</p>
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-center space-y-4"
        >
          <p className="font-medium">{error}</p>
          <button onClick={fetchData} className="flex items-center gap-2 mx-auto px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors">
            <RefreshCcw size={16} /> Retry
          </button>
        </motion.div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">@{channel}</h1>
              <p className="text-muted-foreground">{posts.length} messages found</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadCSV}
                disabled={posts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-50 transition-all"
              >
                <Download size={18} /> CSV
              </button>
              <button
                onClick={downloadHTML}
                disabled={posts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                <Download size={18} /> HTML
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {isFetching ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-primary" size={48} />
                </div>
              </motion.div>
            ) : (
              <motion.ul
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {posts.length === 0 ? (
                  <li className="text-center py-20 text-muted-foreground">No messages found for this criteria.</li>
                ) : (
                  posts.map((p) => (
                    <motion.li
                      id={`msg-${p.message_id}`}
                      key={p.message_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-y-3"
                    >
                      {/* Top Indicators: Forward, Reply, Media */}
                      <div className="flex flex-wrap gap-2">
                        {p.is_forwarded && (
                          <div className="px-2 py-0.5 bg-info/10 text-info text-[10px] font-medium rounded-full inline-flex items-center gap-1 border border-info/20">
                            <Info size={12} />
                            {p.forwarded_from ? `Forwarded from ${p.forwarded_from}` : 'Forwarded'}
                          </div>
                        )}

                        {p.reply_to_text && (
                          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-md p-2 text-primary text-xs">
                            <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium">Replying to</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {p.reply_to_text}
                              </div>
                            </div>
                          </div>
                        )}

                        {p.media_type && (
                          <div className="px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] font-medium rounded-full inline-flex items-center gap-1 border border-border">
                            <ImageIcon size={12} />
                            {p.media_type}
                          </div>
                        )}
                      </div>

                      {/* Main Content Area */}
                      <div className="space-y-3">
                        {/* Media Display */}
                        {p.media_type && (
                          <MessageMedia media_url={p.media_url} media_type={p.media_type} />
                        )}

                        <div className="text-foreground leading-relaxed break-words">
                          <MessageContent text={p.text} />
                        </div>
                      </div>

                      {/* Bottom: Links & Metadata */}
                      <div className="flex flex-col gap-y-2 pt-2 mt-auto border-t border-border/50">
                        <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <time title={p.datetime_utc} dir="ltr">{p.datetime_utc}</time>
                            {formatShamsi(p.datetime_utc) && (
                              <span className="opacity-70">| {formatShamsi(p.datetime_utc)}</span>
                            )}
                          </div>
                          <span className="flex items-center gap-1">
                            {p.views ? `${p.views} views` : ''}
                          </span>
                        </div>

                        {p.link && (
                          <a
                            href={p.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline self-start"
                          >
                            View on Telegram
                          </a>
                        )}
                      </div>
                    </motion.li>
                  ))
                )}
              </motion.ul>
            )}
          </AnimatePresence>

          {logLines.length > 0 && (
            <div className="mt-12 pt-6 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">System Logs</h3>
              <div className="bg-black/5 dark:bg-black/20 rounded-lg p-4 font-mono text-[10px] sm:text-xs overflow-hidden">
                {logLines.map((line, idx) => (
                  <div key={idx} className="truncate">{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
