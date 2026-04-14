'use client';

import { useState } from 'react';

interface ScanConfig {
  targetUrl: string;
  docPath: string;
  exampleData: string;
  headed: boolean;
  auth: {
    type: string;
    loginUrl: string;
    username: string;
    password: string;
  };
}

interface ScanFormProps {
  onStartScan: (config: ScanConfig) => void;
  isScanning: boolean;
  compact?: boolean;
}

export default function ScanForm({ onStartScan, isScanning, compact }: ScanFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [config, setConfig] = useState<ScanConfig>({
    targetUrl: '',
    docPath: '',
    exampleData: '',
    headed: false,
    auth: { type: 'none', loginUrl: '', username: '', password: '' },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.targetUrl || isScanning) return;
    onStartScan(config);
  };

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          type="url"
          required
          placeholder="Target URL..."
          value={config.targetUrl}
          onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          className="flex-1 bg-surface2 border border-border rounded-xl px-4 py-2.5 text-text placeholder:text-muted/40 focus:outline-none focus:border-danger/50 focus:ring-1 focus:ring-danger/20 transition-all font-mono text-sm"
        />
        <button
          type="submit"
          disabled={isScanning || !config.targetUrl}
          className="bg-gradient-to-r from-danger to-accent hover:opacity-90 disabled:opacity-30 text-white font-bold py-2.5 px-6 rounded-xl transition-all text-xs tracking-wider uppercase whitespace-nowrap"
        >
          {isScanning ? 'Scanning...' : 'New Scan'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto animate-float-in">
      <div className="relative">
        {/* Glow effect behind the card */}
        <div className="absolute -inset-1 bg-gradient-to-r from-danger/20 via-accent/20 to-cyan/20 rounded-3xl blur-xl opacity-50" />

        <div className="relative bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          {/* Logo + title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-danger via-accent to-cyan mx-auto mb-4 flex items-center justify-center shadow-lg shadow-danger/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 className="text-3xl font-black tracking-[0.1em] bg-gradient-to-r from-danger via-warning to-accent bg-clip-text text-transparent">
              SENTINEL
            </h2>
            <p className="text-muted text-sm mt-1.5">Enter a URL. Get a full security &amp; QA report.</p>
          </div>

          <div className="space-y-4">
            {/* URL input - the star of the show */}
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">Target URL</label>
              <div className="relative">
                <input
                  type="url"
                  required
                  placeholder="https://your-app.com"
                  value={config.targetUrl}
                  onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
                  className="w-full bg-surface2 border border-border rounded-xl px-4 py-3.5 text-text placeholder:text-muted/30 focus:outline-none focus:border-danger/50 focus:ring-2 focus:ring-danger/20 transition-all font-mono text-sm"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/30">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Doc path */}
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                Documentation <span className="text-muted/50 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="./docs/API.md"
                value={config.docPath}
                onChange={(e) => setConfig({ ...config, docPath: e.target.value })}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-text placeholder:text-muted/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all text-sm"
              />
            </div>

            {/* Example data */}
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                Example Data <span className="text-muted/50 font-normal normal-case">(optional JSON)</span>
              </label>
              <input
                type="text"
                placeholder='{"searchQuery": "Widget", "username": "admin"}'
                value={config.exampleData}
                onChange={(e) => setConfig({ ...config, exampleData: e.target.value })}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-text placeholder:text-muted/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-mono text-sm"
              />
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-muted hover:text-text transition-colors flex items-center gap-2 group"
            >
              <span className={`transition-transform duration-200 text-[10px] ${showAdvanced ? 'rotate-90' : ''}`}>&#9654;</span>
              <span className="group-hover:underline">Authentication &amp; Options</span>
            </button>

            {showAdvanced && (
              <div className="space-y-3 pl-4 border-l-2 border-border animate-float-in">
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Auth Type</label>
                  <select
                    value={config.auth.type}
                    onChange={(e) => setConfig({ ...config, auth: { ...config.auth, type: e.target.value } })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent/50"
                  >
                    <option value="none">None</option>
                    <option value="form-login">Form Login</option>
                    <option value="basic">HTTP Basic</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="cookie">Cookie</option>
                  </select>
                </div>
                {config.auth.type !== 'none' && (
                  <>
                    <input
                      type="text"
                      placeholder="Login URL"
                      value={config.auth.loginUrl}
                      onChange={(e) => setConfig({ ...config, auth: { ...config.auth, loginUrl: e.target.value } })}
                      className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted/30 text-sm focus:outline-none focus:border-accent/50"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Username"
                        value={config.auth.username}
                        onChange={(e) => setConfig({ ...config, auth: { ...config.auth, username: e.target.value } })}
                        className="bg-surface2 border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted/30 text-sm focus:outline-none focus:border-accent/50"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={config.auth.password}
                        onChange={(e) => setConfig({ ...config, auth: { ...config.auth, password: e.target.value } })}
                        className="bg-surface2 border border-border rounded-lg px-3 py-2 text-text placeholder:text-muted/30 text-sm focus:outline-none focus:border-accent/50"
                      />
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-text transition-colors">
                  <input
                    type="checkbox"
                    checked={config.headed}
                    onChange={(e) => setConfig({ ...config, headed: e.target.checked })}
                    className="rounded border-border accent-danger"
                  />
                  Show browser window (headed mode)
                </label>
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isScanning || !config.targetUrl}
            className="w-full mt-6 relative overflow-hidden bg-gradient-to-r from-danger via-accent to-cyan text-white font-bold py-4 px-6 rounded-xl transition-all text-sm tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-danger/20 hover:scale-[1.01] active:scale-[0.99]"
          >
            {isScanning ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Launch Scan
              </span>
            )}
          </button>

          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {['16 Categories', 'AI-Powered', 'Real Browser', 'WCAG Audit', 'SARIF Export'].map((badge) => (
              <span key={badge} className="text-[10px] font-medium text-muted/60 bg-surface2 border border-border/50 px-2 py-0.5 rounded-full">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
