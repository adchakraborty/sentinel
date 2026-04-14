'use client';

interface CategoryChartProps {
  categories: Record<string, number>;
}

const categoryColors: Record<string, { bar: string; text: string }> = {
  injection: { bar: 'bg-danger', text: 'text-danger' },
  xss: { bar: 'bg-warning', text: 'text-warning' },
  auth: { bar: 'bg-danger', text: 'text-danger' },
  traversal: { bar: 'bg-danger', text: 'text-danger' },
  ssrf: { bar: 'bg-danger', text: 'text-danger' },
  idor: { bar: 'bg-warning', text: 'text-warning' },
  'info-leak': { bar: 'bg-warning', text: 'text-warning' },
  redirect: { bar: 'bg-caution', text: 'text-caution' },
  cors: { bar: 'bg-warning', text: 'text-warning' },
  csrf: { bar: 'bg-warning', text: 'text-warning' },
  storage: { bar: 'bg-caution', text: 'text-caution' },
  validation: { bar: 'bg-caution', text: 'text-caution' },
  dos: { bar: 'bg-caution', text: 'text-caution' },
  accessibility: { bar: 'bg-accent', text: 'text-accent' },
  ux: { bar: 'bg-cyan', text: 'text-cyan' },
  functional: { bar: 'bg-info', text: 'text-info' },
  exploratory: { bar: 'bg-accent', text: 'text-accent' },
};

export default function CategoryChart({ categories }: CategoryChartProps) {
  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {entries.map(([cat, count], i) => {
        const colors = categoryColors[cat] || { bar: 'bg-muted', text: 'text-muted' };
        return (
          <div
            key={cat}
            className="flex items-center gap-3 animate-slide-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className={`text-[11px] ${colors.text} w-24 text-right font-mono font-semibold truncate`}>
              {cat}
            </span>
            <div className="flex-1 bg-surface2 rounded-full h-6 overflow-hidden border border-border/30">
              <div
                className={`h-full rounded-full ${colors.bar} transition-all duration-1000 ease-out relative overflow-hidden`}
                style={{ width: `${Math.max((count / max) * 100, 8)}%` }}
              >
                <div className="absolute inset-0 shimmer-bg" />
              </div>
            </div>
            <span className={`text-sm font-black ${colors.text} w-8 text-right tabular-nums`}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
