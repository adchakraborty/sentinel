'use client';

import SeverityCards from './SeverityCards';
import RiskGauge from './RiskGauge';
import FindingsList, { type Finding } from './FindingsList';
import CategoryChart from './CategoryChart';
import ScanTimeline, { type TimelineEvent } from './ScanTimeline';
import ReportDownload from './ReportDownload';

export interface ScanResults {
  target: string;
  duration: number;
  pagesScanned: number;
  attacksExecuted: number;
  riskScore: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  findings: Finding[];
  categories: Record<string, number>;
  htmlReport?: string;
  markdownReport?: string;
  sarifReport?: string;
  jsonReport?: string;
}

interface DashboardProps {
  results: ScanResults | null;
  events: TimelineEvent[];
  isScanning: boolean;
}

export default function Dashboard({ results, events, isScanning }: DashboardProps) {
  return (
    <div className="space-y-6 animate-float-in">
      {events.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main content area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Scanning spinner */}
            {!results && isScanning && (
              <div className="bg-surface border border-border rounded-2xl p-12 flex flex-col items-center justify-center">
                <div className="relative w-20 h-20 mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-border" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-danger animate-spin" />
                  <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-accent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                  <div className="absolute inset-4 rounded-full border-2 border-transparent border-t-cyan animate-spin" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-danger animate-glow" />
                  </div>
                </div>
                <p className="text-text font-bold text-sm">Scan in Progress</p>
                <p className="text-muted text-xs mt-1">Watch the timeline for real-time updates →</p>
              </div>
            )}

            {/* Results header with gauge */}
            {results && (
              <>
                <div className="bg-surface border border-border rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <h2 className="text-lg font-black text-text tracking-wide">Scan Complete</h2>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        <span className="text-xs text-muted">
                          <span className="text-text font-semibold">{results.target}</span>
                        </span>
                        <span className="text-xs text-muted">
                          Duration: <span className="text-text font-semibold">{(results.duration / 1000).toFixed(1)}s</span>
                        </span>
                        <span className="text-xs text-muted">
                          Pages: <span className="text-text font-semibold">{results.pagesScanned}</span>
                        </span>
                        <span className="text-xs text-muted">
                          Tests: <span className="text-text font-semibold">{results.attacksExecuted}</span>
                        </span>
                      </div>
                      <div className="mt-4">
                        <SeverityCards
                          critical={results.critical}
                          high={results.high}
                          medium={results.medium}
                          low={results.low}
                          total={results.findings.length}
                        />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <RiskGauge score={results.riskScore} />
                    </div>
                  </div>
                </div>

                {/* Category breakdown */}
                {Object.keys(results.categories).length > 0 && (
                  <div className="bg-surface border border-border rounded-2xl p-6">
                    <h3 className="text-xs font-black text-muted uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                      Category Breakdown
                    </h3>
                    <CategoryChart categories={results.categories} />
                  </div>
                )}

                {/* Findings */}
                <div className="bg-surface border border-border rounded-2xl p-6">
                  <h3 className="text-xs font-black text-muted uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    Findings
                    <span className="text-text bg-surface2 px-2 py-0.5 rounded-full text-[10px] font-bold border border-border/50">
                      {results.findings.length}
                    </span>
                  </h3>
                  <FindingsList findings={results.findings} />
                </div>

                {/* Downloads */}
                <div className="bg-surface border border-border rounded-2xl p-6">
                  <h3 className="text-xs font-black text-muted uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Export Reports
                  </h3>
                  <ReportDownload
                    htmlReport={results.htmlReport}
                    markdownReport={results.markdownReport}
                    sarifReport={results.sarifReport}
                    jsonReport={results.jsonReport}
                  />
                </div>
              </>
            )}
          </div>

          {/* Timeline sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-surface border border-border rounded-2xl p-5 sticky top-16">
              <h3 className="text-xs font-black text-muted uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Timeline
                {isScanning && <span className="ml-auto w-2 h-2 bg-danger rounded-full animate-glow" />}
              </h3>
              <div className="max-h-[75vh] overflow-y-auto pr-1">
                <ScanTimeline events={events} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
