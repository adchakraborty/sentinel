import { describe, it, expect } from 'vitest';
import { generateMarkdownReport, generateHtmlReport } from './report-generator.js';
import { NemesisReport } from '../types.js';

function makeReport(overrides: Partial<NemesisReport> = {}): NemesisReport {
  return {
    target: 'http://localhost:3001',
    startedAt: '2026-04-07T10:00:00Z',
    completedAt: '2026-04-07T10:05:00Z',
    duration: 300000,
    pagesScanned: 3,
    attacksExecuted: 15,
    vulnerabilitiesFound: 2,
    criticalCount: 1,
    highCount: 1,
    mediumCount: 0,
    lowCount: 0,
    pages: [
      {
        url: 'http://localhost:3001/',
        title: 'Home',
        forms: [],
        links: [],
        inputs: [],
        cookies: [],
        storage: { localStorage: [], sessionStorage: [], indexedDBDatabases: [] },
        headers: {},
        htmlSnippet: '<div>Home</div>',
      },
    ],
    results: [
      {
        attack: {
          id: 'ATK-1', category: 'injection', name: 'SQL Injection on search',
          description: 'Test SQLi', target: { type: 'form', selector: '#search' },
          payloads: ["' OR 1=1 --"], successIndicators: ['error', 'syntax'],
          severity: 'critical',
        },
        pageUrl: 'http://localhost:3001/search',
        success: true,
        evidence: 'SQL error in response after payload',
        duration: 1500,
        reproductionSteps: ['Navigate to /search', 'Enter payload', 'Submit'],
        timestamp: '2026-04-07T10:01:00Z',
      },
      {
        attack: {
          id: 'ATK-2', category: 'xss', name: 'Reflected XSS',
          description: 'Test XSS', target: { type: 'form', selector: '#search' },
          payloads: ['<script>alert(1)</script>'], successIndicators: ['alert'],
          severity: 'high',
        },
        pageUrl: 'http://localhost:3001/search',
        success: true,
        evidence: 'XSS payload reflected in DOM',
        duration: 800,
        reproductionSteps: ['Navigate to /search', 'Enter XSS payload'],
        timestamp: '2026-04-07T10:02:00Z',
      },
    ],
    ...overrides,
  };
}

describe('generateMarkdownReport', () => {
  it('includes target URL and summary stats', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('http://localhost:3001');
    expect(md).toContain('Pages Scanned');
    expect(md).toContain('Vulnerabilities Found');
    expect(md).toContain('**2**');
  });

  it('includes vulnerability details', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('SQL Injection on search');
    expect(md).toContain('Reflected XSS');
    expect(md).toContain('CRITICAL');
    expect(md).toContain('HIGH');
  });

  it('includes risk score', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('Risk Score');
  });

  it('includes version 3.0.0', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('NEMESIS v3.0.0');
  });

  it('handles zero vulnerabilities', () => {
    const md = generateMarkdownReport(makeReport({
      vulnerabilitiesFound: 0, criticalCount: 0, highCount: 0,
      results: [],
    }));
    expect(md).toContain('**0**');
    expect(md).not.toContain('Confirmed Vulnerabilities');
  });

  it('generates valid Mermaid diagram without breaking chars', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('```mermaid');
    expect(md).toContain('flowchart TB');
  });

  it('includes reproduction steps', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('Reproduction Steps');
    expect(md).toContain('Navigate to /search');
  });
});

describe('generateHtmlReport', () => {
  it('produces valid HTML with doctype', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes target URL', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('http://localhost:3001');
  });

  it('includes vulnerability cards', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('SQL Injection on search');
    expect(html).toContain('severity-critical');
    expect(html).toContain('severity-high');
  });

  it('escapes HTML in evidence', () => {
    const report = makeReport();
    report.results[0].evidence = '<script>alert("xss")</script>';
    const html = generateHtmlReport(report);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert("xss")</script>');
  });

  it('includes version 3.0.0', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('NEMESIS v3.0.0');
  });

  it('shows time to breach when present', () => {
    const html = generateHtmlReport(makeReport({ timeToFirstBreach: 5000 }));
    expect(html).toContain('Time to Breach');
    expect(html).toContain('5.0s');
  });
});
