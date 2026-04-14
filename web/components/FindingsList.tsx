'use client';

import { useState } from 'react';

export interface Finding {
  id: string;
  category: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string;
  pageUrl: string;
  reproductionSteps: string[];
  remediation?: string;
  cwe?: string;
}

interface FindingsListProps {
  findings: Finding[];
}

const severityConfig = {
  critical: {
    bg: 'bg-danger/5', border: 'border-l-danger', badge: 'bg-danger text-white',
    label: 'CRIT', glow: 'hover:shadow-danger/10',
  },
  high: {
    bg: 'bg-warning/5', border: 'border-l-warning', badge: 'bg-warning text-black',
    label: 'HIGH', glow: 'hover:shadow-warning/10',
  },
  medium: {
    bg: 'bg-caution/5', border: 'border-l-caution', badge: 'bg-caution text-black',
    label: 'MED', glow: 'hover:shadow-caution/10',
  },
  low: {
    bg: 'bg-info/5', border: 'border-l-info', badge: 'bg-info text-white',
    label: 'LOW', glow: 'hover:shadow-info/10',
  },
};

export default function FindingsList({ findings }: FindingsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (findings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d68f" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
        </div>
        <p className="text-lg font-bold text-success">All Clear</p>
        <p className="text-sm text-muted mt-1">No vulnerabilities detected in this scan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((finding, i) => {
        const config = severityConfig[finding.severity];
        const isExpanded = expandedId === finding.id;
        return (
          <div
            key={finding.id}
            className={`border-l-4 ${config.border} ${config.bg} bg-surface rounded-r-xl overflow-hidden transition-all duration-200 ${config.glow} hover:shadow-lg animate-slide-in`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : finding.id)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
            >
              <span className={`${config.badge} text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 tracking-wider`}>
                {config.label}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-text leading-tight">{finding.name}</h4>
                <p className="text-[11px] text-muted mt-0.5 truncate font-mono">{finding.pageUrl}</p>
              </div>
              <span className="text-[10px] text-muted bg-surface2 px-2 py-0.5 rounded-full font-mono shrink-0 border border-border/50">
                {finding.category}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-muted transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/30 animate-float-in">
                <div className="mt-3">
                  <h5 className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Evidence</h5>
                  <pre className="bg-surface2 rounded-lg p-3 text-xs text-muted font-mono whitespace-pre-wrap break-all border border-border/30 leading-relaxed">
                    {finding.evidence}
                  </pre>
                </div>
                {finding.reproductionSteps.length > 0 && (
                  <div>
                    <h5 className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Steps to Reproduce</h5>
                    <ol className="list-decimal list-inside text-xs text-muted space-y-1">
                      {finding.reproductionSteps.map((step, j) => (
                        <li key={j} className="leading-relaxed">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {finding.cwe && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-muted uppercase tracking-wider">CWE</span>
                      <span className="text-xs text-accent font-mono bg-accent/10 px-2 py-0.5 rounded-full">{finding.cwe}</span>
                    </div>
                  )}
                </div>
                {finding.remediation && (
                  <div className="bg-success/5 border border-success/20 rounded-lg p-3">
                    <h5 className="text-[10px] font-black text-success uppercase tracking-widest mb-1">Fix</h5>
                    <p className="text-xs text-muted leading-relaxed">{finding.remediation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
