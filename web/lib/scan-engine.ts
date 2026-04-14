import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Recon } from '../../src/core/recon';
import { Attacker } from '../../src/core/attacker';
import { generateHtmlReport, generateMarkdownReport } from '../../src/reporters/report-generator';
import { generateSarifReport } from '../../src/reporters/sarif-generator';
import { generateAttackPlans } from './github-llm';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import type { NemesisConfig, AttackPlan, AttackResult, NemesisReport, PageMap, Attack } from '../../src/types';

type ProgressPhase = 'recon' | 'planning' | 'attacking' | 'reporting' | 'complete' | 'error';

interface ScanConfig {
  targetUrl: string;
  docPath?: string;
  exampleData?: Record<string, string>;
  headed?: boolean;
  auth?: {
    type: 'form-login' | 'idp-login' | 'cookie' | 'bearer' | 'basic' | 'none';
    loginUrl?: string;
    username?: string;
    password?: string;
    token?: string;
  };
}

interface ProgressCallback {
  onProgress: (phase: ProgressPhase, message: string) => void;
  onFinding: (finding: AttackResult & { remediation?: string; cwe?: string }) => void;
}

const REMEDIATION: Record<string, { fix: string; cwe: string }> = {
  injection: { fix: 'Use parameterized queries or prepared statements.', cwe: 'CWE-89' },
  xss: { fix: 'Encode all user-supplied output. Use Content-Security-Policy headers.', cwe: 'CWE-79' },
  auth: { fix: 'Enforce server-side authentication on all protected routes.', cwe: 'CWE-287' },
  traversal: { fix: 'Validate and sanitize file paths. Reject paths containing "..".', cwe: 'CWE-22' },
  validation: { fix: 'Implement server-side validation for all inputs.', cwe: 'CWE-20' },
  cors: { fix: 'Never reflect arbitrary origins. Whitelist specific trusted origins.', cwe: 'CWE-942' },
  csrf: { fix: 'Implement anti-CSRF tokens on all state-changing operations.', cwe: 'CWE-352' },
  storage: { fix: 'Never store sensitive data in localStorage or sessionStorage.', cwe: 'CWE-922' },
  dos: { fix: 'Implement rate limiting. Avoid catastrophic regex backtracking.', cwe: 'CWE-400' },
  ssrf: { fix: 'Validate and whitelist allowed URLs/domains.', cwe: 'CWE-918' },
  idor: { fix: 'Implement authorization checks on every resource access.', cwe: 'CWE-639' },
  'info-leak': { fix: 'Remove debug endpoints in production. Use generic error messages.', cwe: 'CWE-200' },
  redirect: { fix: 'Validate redirect URLs against a whitelist.', cwe: 'CWE-601' },
  accessibility: { fix: 'Add alt text, labels, heading hierarchy, skip links. Meet WCAG 2.1 AA.', cwe: 'CWE-1064' },
  ux: { fix: 'Fix broken images/links. Add loading indicators. Optimize page load.', cwe: 'N/A' },
  functional: { fix: 'Review feature against product requirements.', cwe: 'N/A' },
  exploratory: { fix: 'Investigate unexpected behavior. Add error handling.', cwe: 'N/A' },
};

export async function runScan(scanConfig: ScanConfig, callbacks: ProgressCallback) {
  const startTime = Date.now();
  const tmpDir = path.join(os.tmpdir(), `sentinel-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const screenshotDir = path.join(tmpDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const authConfig = scanConfig.auth && scanConfig.auth.type !== 'none'
    ? {
        type: scanConfig.auth.type as 'form-login' | 'idp-login' | 'cookie' | 'bearer' | 'basic' | 'none',
        loginUrl: scanConfig.auth.loginUrl,
        username: scanConfig.auth.username,
        password: scanConfig.auth.password,
        token: scanConfig.auth.token,
      }
    : undefined;

  const config: NemesisConfig = {
    targetUrl: scanConfig.targetUrl,
    maxPages: 10,
    headless: !scanConfig.headed,
    timeout: 15000,
    screenshotDir,
    outputDir: tmpDir,
    auth: authConfig,
  };

  const recon = new Recon(config);
  let pages: PageMap[] = [];
  let allResults: AttackResult[] = [];

  try {
    // Phase 1: Recon
    callbacks.onProgress('recon', 'Launching browser...');
    await recon.launch();

    callbacks.onProgress('recon', 'Crawling target application...');
    pages = await recon.crawl();
    callbacks.onProgress('recon', `Discovered ${pages.length} pages with ${pages.reduce((s, p) => s + p.forms.length, 0)} forms`);

    // Phase 2: Read docs if provided
    let docContent: string | undefined;
    if (scanConfig.docPath) {
      try {
        const absPath = path.resolve(scanConfig.docPath);
        docContent = fs.readFileSync(absPath, 'utf-8');
        callbacks.onProgress('planning', `Read documentation (${docContent.length} chars)`);
      } catch {
        callbacks.onProgress('planning', `Could not read doc at ${scanConfig.docPath}`);
      }
    }

    // Phase 3: LLM generates attack plans
    callbacks.onProgress('planning', 'AI is analyzing recon data and designing attack plans...');
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(pages as Parameters<typeof buildUserPrompt>[0], docContent, scanConfig.exampleData);

    let attackPlans: AttackPlan[];
    try {
      const rawPlans = await generateAttackPlans(systemPrompt, userPrompt);
      attackPlans = rawPlans as AttackPlan[];
      const totalAttacks = attackPlans.reduce((s, p) => s + (p.attacks?.length || 0), 0);
      callbacks.onProgress('planning', `AI generated ${attackPlans.length} plans with ${totalAttacks} attacks`);
    } catch (err) {
      callbacks.onProgress('error', `LLM error: ${err instanceof Error ? err.message : 'Unknown'}`);
      throw err;
    }

    // Phase 4: Execute attacks
    callbacks.onProgress('attacking', 'Executing attack plans in real browser...');
    const context = recon.getContext();
    const attacker = new Attacker(context, config);

    attacker.onAttackStart = (attack: Attack) => {
      callbacks.onProgress('attacking', `Testing: ${attack.name} (${attack.category})`);
    };

    attacker.onAttackResult = (result: AttackResult) => {
      if (result.success) {
        const rem = REMEDIATION[result.attack.category];
        callbacks.onFinding({
          ...result,
          remediation: rem?.fix,
          cwe: rem?.cwe,
        });
      }
    };

    allResults = await attacker.executeAll(attackPlans);
    callbacks.onProgress('attacking', `Executed ${allResults.length} attacks, ${allResults.filter((r) => r.success).length} findings`);

    // Phase 5: Generate reports
    callbacks.onProgress('reporting', 'Generating reports...');

    const findings = allResults.filter((r) => r.success);
    const report: NemesisReport = {
      target: scanConfig.targetUrl,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      pagesScanned: pages.length,
      attacksExecuted: allResults.length,
      vulnerabilitiesFound: findings.length,
      criticalCount: findings.filter((f) => f.attack.severity === 'critical').length,
      highCount: findings.filter((f) => f.attack.severity === 'high').length,
      mediumCount: findings.filter((f) => f.attack.severity === 'medium').length,
      lowCount: findings.filter((f) => f.attack.severity === 'low').length,
      pages,
      results: allResults,
    };

    const htmlReport = generateHtmlReport(report);
    const markdownReport = generateMarkdownReport(report);
    const sarifReport = generateSarifReport(report);

    const riskScore = Math.min(100, report.criticalCount * 25 + report.highCount * 15 + report.mediumCount * 8 + report.lowCount * 3);

    const categories: Record<string, number> = {};
    for (const f of findings) {
      categories[f.attack.category] = (categories[f.attack.category] || 0) + 1;
    }

    callbacks.onProgress('complete', 'Scan complete!');

    return {
      target: scanConfig.targetUrl,
      duration: Date.now() - startTime,
      pagesScanned: pages.length,
      attacksExecuted: allResults.length,
      riskScore,
      critical: report.criticalCount,
      high: report.highCount,
      medium: report.mediumCount,
      low: report.lowCount,
      findings: findings.map((f) => {
        const rem = REMEDIATION[f.attack.category];
        return {
          id: f.attack.id,
          category: f.attack.category,
          name: f.attack.name,
          severity: f.attack.severity,
          evidence: f.evidence,
          pageUrl: f.pageUrl,
          reproductionSteps: f.reproductionSteps,
          remediation: rem?.fix,
          cwe: rem?.cwe,
        };
      }),
      categories,
      htmlReport,
      markdownReport,
      sarifReport,
      jsonReport: JSON.stringify(report, null, 2),
    };
  } finally {
    await recon.close();
  }
}
