'use client';

import { useState, useCallback, useRef } from 'react';
import Header from '../components/Header';
import ScanForm from '../components/ScanForm';
import Dashboard, { type ScanResults } from '../components/Dashboard';
import type { TimelineEvent } from '../components/ScanTimeline';
import type { Finding } from '../components/FindingsList';

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventIdRef = useRef(0);

  const addEvent = useCallback((phase: TimelineEvent['phase'], message: string) => {
    const event: TimelineEvent = {
      id: String(++eventIdRef.current),
      phase,
      message,
      timestamp: Date.now(),
    };
    setEvents((prev) => [...prev, event]);
  }, []);

  const handleStartScan = useCallback(async (config: {
    targetUrl: string;
    docPath: string;
    exampleData: string;
    headed: boolean;
    auth: { type: string; loginUrl: string; username: string; password: string };
  }) => {
    setIsScanning(true);
    setResults(null);
    setEvents([]);
    setError(null);
    eventIdRef.current = 0;

    addEvent('recon', `Initiating scan of ${config.targetUrl}`);

    try {
      const body: Record<string, unknown> = {
        targetUrl: config.targetUrl,
        headed: config.headed,
      };
      if (config.docPath) body.docPath = config.docPath;
      if (config.exampleData) {
        try { body.exampleData = JSON.parse(config.exampleData); } catch { /* ignore */ }
      }
      if (config.auth.type !== 'none') body.auth = config.auth;

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errMsg = 'Scan request failed';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = await response.text();
        }
        addEvent('error', errMsg);
        setError(errMsg);
        setIsScanning(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        addEvent('error', 'No response stream');
        setError('Failed to establish connection');
        setIsScanning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'progress':
                addEvent(event.phase || 'recon', event.message);
                break;
              case 'finding': {
                const finding: Finding = {
                  id: event.data.id,
                  category: event.data.category,
                  name: event.data.name,
                  severity: event.data.severity,
                  evidence: event.data.evidence,
                  pageUrl: event.data.pageUrl,
                  reproductionSteps: event.data.reproductionSteps || [],
                  remediation: event.data.remediation,
                  cwe: event.data.cwe,
                };
                setResults((prev) => {
                  if (!prev) return null;
                  const updated = { ...prev };
                  updated.findings = [...updated.findings, finding];
                  updated[finding.severity] = (updated[finding.severity] || 0) + 1;
                  updated.categories = { ...updated.categories };
                  updated.categories[finding.category] = (updated.categories[finding.category] || 0) + 1;
                  return updated;
                });
                addEvent('attacking', `Found: ${finding.name} [${finding.severity.toUpperCase()}]`);
                break;
              }
              case 'results':
                setResults({
                  target: event.data.target,
                  duration: event.data.duration,
                  pagesScanned: event.data.pagesScanned,
                  attacksExecuted: event.data.attacksExecuted,
                  riskScore: event.data.riskScore,
                  critical: event.data.critical,
                  high: event.data.high,
                  medium: event.data.medium,
                  low: event.data.low,
                  findings: (event.data.findings || []).map((f: Record<string, unknown>) => ({
                    id: f.id as string,
                    category: f.category as string,
                    name: f.name as string,
                    severity: f.severity as Finding['severity'],
                    evidence: f.evidence as string,
                    pageUrl: f.pageUrl as string,
                    reproductionSteps: (f.reproductionSteps || []) as string[],
                    remediation: f.remediation as string | undefined,
                    cwe: f.cwe as string | undefined,
                  })),
                  categories: event.data.categories || {},
                  htmlReport: event.data.htmlReport,
                  markdownReport: event.data.markdownReport,
                  sarifReport: event.data.sarifReport,
                  jsonReport: event.data.jsonReport,
                });
                addEvent('complete', `Scan complete — ${event.data.findings?.length || 0} findings`);
                break;
              case 'error':
                addEvent('error', event.message || 'Unknown error');
                setError(event.message);
                break;
            }
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      addEvent('error', msg);
      setError(msg);
    } finally {
      setIsScanning(false);
    }
  }, [addEvent]);

  const hasStarted = isScanning || results || events.length > 0;

  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Landing state - centered form */}
        {!hasStarted && (
          <div className="flex flex-col items-center justify-center min-h-[75vh]">
            <ScanForm onStartScan={handleStartScan} isScanning={isScanning} />
          </div>
        )}

        {/* Active state - compact form + dashboard */}
        {hasStarted && (
          <>
            <div className="mb-6">
              <ScanForm onStartScan={handleStartScan} isScanning={isScanning} compact />
            </div>

            {/* Error banner */}
            {error && !isScanning && (
              <div className="mb-6 bg-danger/10 border border-danger/30 rounded-xl p-4 flex items-start gap-3 animate-float-in">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff3b3b" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-danger">Scan Error</p>
                  <p className="text-xs text-muted mt-0.5">{error}</p>
                </div>
              </div>
            )}

            <Dashboard results={results} events={events} isScanning={isScanning} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-16 py-6 text-center">
        <p className="text-xs text-muted/40">
          SENTINEL v3.2 — AI-Powered Autonomous Security &amp; QA Testing
        </p>
      </footer>
    </div>
  );
}
