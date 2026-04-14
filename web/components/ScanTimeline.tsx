'use client';

export interface TimelineEvent {
  id: string;
  phase: 'recon' | 'planning' | 'attacking' | 'reporting' | 'complete' | 'error';
  message: string;
  timestamp: number;
}

interface ScanTimelineProps {
  events: TimelineEvent[];
}

const phaseConfig = {
  recon: { color: 'text-cyan', dot: 'bg-cyan', label: 'RECON' },
  planning: { color: 'text-accent', dot: 'bg-accent', label: 'AI' },
  attacking: { color: 'text-danger', dot: 'bg-danger', label: 'ATTACK' },
  reporting: { color: 'text-success', dot: 'bg-success', label: 'REPORT' },
  complete: { color: 'text-success', dot: 'bg-success', label: 'DONE' },
  error: { color: 'text-danger', dot: 'bg-danger', label: 'ERROR' },
};

export default function ScanTimeline({ events }: ScanTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const config = phaseConfig[event.phase];
        const isLast = i === events.length - 1;
        return (
          <div key={event.id} className="flex gap-3 animate-slide-in" style={{ animationDelay: `${i * 20}ms` }}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className={`w-2 h-2 rounded-full ${config.dot} shrink-0 mt-1.5 relative z-10`} />
                {isLast && (
                  <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.dot} mt-1.5 animate-ping opacity-50`} />
                )}
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/50 min-h-[16px]" />}
            </div>
            <div className="pb-2.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black ${config.color} uppercase tracking-widest opacity-70`}>
                  {config.label}
                </span>
                <span className="text-[9px] text-muted/40 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <p className={`text-[11px] ${config.color} leading-relaxed mt-0.5`}>
                {event.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
