'use client';

import { useEffect, useState } from 'react';

interface RiskGaugeProps {
  score: number;
}

export default function RiskGauge({ score }: RiskGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1500;
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimatedScore(Math.floor(eased * score));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [score]);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  const getConfig = (s: number) => {
    if (s >= 75) return { color: '#ff3b3b', bg: '#ff3b3b20', label: 'CRITICAL RISK', textClass: 'text-danger' };
    if (s >= 50) return { color: '#ff8c00', bg: '#ff8c0020', label: 'HIGH RISK', textClass: 'text-warning' };
    if (s >= 25) return { color: '#ffd000', bg: '#ffd00020', label: 'MODERATE', textClass: 'text-caution' };
    return { color: '#00d68f', bg: '#00d68f20', label: 'LOW RISK', textClass: 'text-success' };
  };

  const { color, bg, label, textClass } = getConfig(animatedScore);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-30 transition-all duration-500"
          style={{ background: bg }}
        />
        <svg width="140" height="140" viewBox="0 0 120 120" className="relative -rotate-90">
          {/* Track */}
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#252535" strokeWidth="10" />
          {/* Progress */}
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-300"
            style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-black tabular-nums ${textClass}`}>{animatedScore}</span>
          <span className="text-[9px] text-muted uppercase tracking-widest font-bold mt-0.5">/ 100</span>
        </div>
      </div>
      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${textClass}`}>{label}</span>
    </div>
  );
}
