'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { normalizeChannel, isValidDate } from '@/lib/scraper';

export default function HomePage() {
  const router = useRouter();
  const [channel, setChannel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!channel.trim()) {
      setError('Please enter a channel name');
      return;
    }

    const normalized = normalizeChannel(channel);
    if (!normalized) {
      setError('Invalid channel name');
      return;
    }

    if (dateFrom && !isValidDate(dateFrom)) {
      setError('Invalid start date (use YYYY-MM-DD)');
      return;
    }
    if (dateTo && !isValidDate(dateTo)) {
      setError('Invalid end date (use YYYY-MM-DD)');
      return;
    }

    const params = new URLSearchParams();
    params.set('channel', normalized);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const query = params.toString();
    router.push(`/channel?${query}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-muted">
      <header className="flex items-center justify-between p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary" size={24} />
          <h1 className="text-lg font-semibold">TG Exporter</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex items-center justify-center px-4 py-12 sm:py-24">
        <div className="w-full max-w-xl space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Export Telegram Channel
            </h1>
            <p className="text-muted-foreground text-lg">
              Download channel history as CSV or HTML. No API key required.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-card border border-border rounded-xl shadow-sm">
            <div className="space-y-2">
              <label htmlFor="channel" className="text-sm font-medium leading-none">
                Channel Name or URL
              </label>
              <input
                id="channel"
                type="text"
                placeholder="irancurrency or @irancurrency"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="date-from" className="text-sm font-medium leading-none">
                  From (optional)
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="date-to" className="text-sm font-medium leading-none">
                  To (optional)
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              className="inline-flex items-center justify-center w-full h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Fetch Messages
              <ArrowRight className="ml-2" size={16} />
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Data is fetched directly from Telegram public preview (t.me) and tgstat.
          </p>
        </div>
      </div>
    </main>
  );
}