'use client';

import { useEffect, useState } from 'react';

interface SeverityCardsProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

function AnimatedCounter({ target, duration = 1000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return <span>{count}</span>;
}

export default function SeverityCards({ critical, high, medium, low, total }: SeverityCardsProps) {
  const cards = [
    {
      label: 'Critical', value: critical,
      gradient: 'from-danger/20 to-danger/5',
      border: 'border-danger/40 hover:border-danger/70',
      text: 'text-danger',
      glow: 'shadow-danger/10',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      ),
    },
    {
      label: 'High', value: high,
      gradient: 'from-warning/20 to-warning/5',
      border: 'border-warning/40 hover:border-warning/70',
      text: 'text-warning',
      glow: 'shadow-warning/10',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97l-7-12a2 2 0 00-3.5 0l-7 12A2 2 0 005.07 19z" /></svg>
      ),
    },
    {
      label: 'Medium', value: medium,
      gradient: 'from-caution/20 to-caution/5',
      border: 'border-caution/40 hover:border-caution/70',
      text: 'text-caution',
      glow: 'shadow-caution/10',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      ),
    },
    {
      label: 'Low', value: low,
      gradient: 'from-info/20 to-info/5',
      border: 'border-info/40 hover:border-info/70',
      text: 'text-info',
      glow: 'shadow-info/10',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
      ),
    },
    {
      label: 'Total', value: total,
      gradient: 'from-surface3 to-surface2',
      border: 'border-border-bright hover:border-text/30',
      text: 'text-text',
      glow: '',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`bg-gradient-to-b ${card.gradient} border ${card.border} rounded-xl p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${card.glow} animate-float-in`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className={`${card.text} opacity-50 flex justify-center mb-2`}>{card.icon}</div>
          <div className={`text-3xl font-black ${card.text} tabular-nums`}>
            <AnimatedCounter target={card.value} />
          </div>
          <div className="text-[10px] text-muted uppercase tracking-widest mt-1 font-bold">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
