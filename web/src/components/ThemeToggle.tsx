'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  const themes: { value: 'light' | 'dark' | 'system'; icon: any; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
      {themes.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.value;
        return (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`
              p-1.5 rounded-md transition-colors
              ${isActive
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}
            `}
            title={`Theme: ${t.label}`}
            aria-label={`Set ${t.label} theme`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}