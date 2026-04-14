import { describe, it, expect } from 'vitest';
import { generateSarifReport } from './sarif-generator.js';
import { NemesisReport, AttackResult } from '../types.js';

function makeResult(overrides: Partial<AttackResult> = {}): AttackResult {
  return {
    attack: {
      id: 'ATK-1', category: 'injection', name: 'SQL Injection',
      description: 'Test', target: { type: 'form', selector: '#q' },
      payloads: ["' OR 1=1 --"], successIndicators: ['error'],
      severity: 'critical',
    },
    pageUrl: 'http://localhost:3001/search',
    success: true,
    evidence: 'SQL error found',
    duration: 1000,
    reproductionSteps: ['Step 1', 'Step 2'],
    timestamp: '2026-04-07T10:00:00Z',
    ...overrides,
  };
}

function makeReport(results: AttackResult[]): NemesisReport {
  const vulns = results.filter((r) => r.success);
  return {
    target: 'http://localhost:3001',
    startedAt: '2026-04-07T10:00:00Z',
    completedAt: '2026-04-07T10:05:00Z',
    duration: 300000,
    pagesScanned: 1,
    attacksExecuted: results.length,
    vulnerabilitiesFound: vulns.length,
    criticalCount: vulns.filter((v) => v.attack.severity === 'critical').length,
    highCount: vulns.filter((v) => v.attack.severity === 'high').length,
    mediumCount: vulns.filter((v) => v.attack.severity === 'medium').length,
    lowCount: vulns.filter((v) => v.attack.severity === 'low').length,
    pages: [],
    results,
  };
}

describe('generateSarifReport', () => {
  it('produces valid SARIF 2.1.0 JSON', () => {
    const sarif = JSON.parse(generateSarifReport(makeReport([makeResult()])));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0');
    expect(sarif.runs).toHaveLength(1);
  });

  it('includes tool info with version 3.0.0', () => {
    const sarif = JSON.parse(generateSarifReport(makeReport([makeResult()])));
    const driver = sarif.runs[0].tool.driver;
    expect(driver.name).toBe('NEMESIS');
    expect(driver.version).toBe('3.0.0');
    expect(driver.semanticVersion).toBe('3.0.0');
  });

  it('maps critical severity to error level', () => {
    const sarif = JSON.parse(generateSarifReport(makeReport([makeResult()])));
    expect(sarif.runs[0].results[0].level).toBe('error');
  });

  it('maps medium severity to warning level', () => {
    const result = makeResult();
    result.attack.severity = 'medium';
    const sarif = JSON.parse(generateSarifReport(makeReport([result])));
    expect(sarif.runs[0].results[0].level).toBe('warning');
  });

  it('maps low severity to note level', () => {
    const result = makeResult();
    result.attack.severity = 'low';
    const sarif = JSON.parse(generateSarifReport(makeReport([result])));
    expect(sarif.runs[0].results[0].level).toBe('note');
  });

  it('only includes successful results', () => {
    const pass = makeResult({ success: false });
    const fail = makeResult({ success: true });
    const sarif = JSON.parse(generateSarifReport(makeReport([pass, fail])));
    expect(sarif.runs[0].results).toHaveLength(1);
  });

  it('builds rules for each unique category', () => {
    const r1 = makeResult();
    r1.attack.category = 'injection';
    const r2 = makeResult();
    r2.attack.id = 'ATK-2';
    r2.attack.category = 'xss';
    r2.attack.name = 'XSS';
    const sarif = JSON.parse(generateSarifReport(makeReport([r1, r2])));
    const rules = sarif.runs[0].tool.driver.rules;
    expect(rules).toHaveLength(2);
    expect(rules.map((r: any) => r.id)).toContain('NEMESIS/injection');
    expect(rules.map((r: any) => r.id)).toContain('NEMESIS/xss');
  });

  it('handles all category names including new ones', () => {
    const categories = ['injection', 'xss', 'auth', 'traversal', 'validation', 'cors', 'csrf', 'storage', 'dos', 'functional', 'exploratory'];
    for (const cat of categories) {
      const r = makeResult();
      r.attack.category = cat as any;
      const sarif = JSON.parse(generateSarifReport(makeReport([r])));
      const rule = sarif.runs[0].tool.driver.rules[0];
      expect(rule.name).toBeTruthy();
      expect(rule.name).not.toBe(cat);
      expect(rule.shortDescription.text).toBeTruthy();
    }
  });

  it('includes invocation timestamps', () => {
    const sarif = JSON.parse(generateSarifReport(makeReport([makeResult()])));
    const invocation = sarif.runs[0].invocations[0];
    expect(invocation.executionSuccessful).toBe(true);
    expect(invocation.startTimeUtc).toBe('2026-04-07T10:00:00Z');
  });

  it('produces empty results for clean report', () => {
    const sarif = JSON.parse(generateSarifReport(makeReport([])));
    expect(sarif.runs[0].results).toEqual([]);
    expect(sarif.runs[0].tool.driver.rules).toEqual([]);
  });
});
