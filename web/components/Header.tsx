'use client';

export default function Header() {
  return (
    <header className="glass border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-danger to-accent flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-xl font-black tracking-[0.12em] bg-gradient-to-r from-danger via-warning to-accent bg-clip-text text-transparent">
              SENTINEL
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted bg-surface2 border border-border px-2 py-0.5 rounded-full uppercase tracking-wider">
              v3.2
            </span>
            <span className="text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
              AI-Powered
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted hidden md:block font-medium">
            Autonomous Security &amp; QA Testing
          </p>
          <div className="w-2 h-2 rounded-full bg-success animate-glow" title="System Online" />
        </div>
      </div>
    </header>
  );
}
