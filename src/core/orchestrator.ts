import * as fs from 'fs';
import * as path from 'path';
import { NemesisConfig, NemesisReport, AttackResult, AttackPlan, PageMap } from '../types.js';
import { Recon } from './recon.js';
import { Attacker } from './attacker.js';
import { generateMarkdownReport, generateHtmlReport } from '../reporters/report-generator.js';
import { generateSarifReport } from '../reporters/sarif-generator.js';

const BANNER = `
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ███╗   ██╗███████╗███╗   ███╗███████╗███████╗██╗███████╗║
║   ████╗  ██║██╔════╝████╗ ████║██╔════╝██╔════╝██║██╔════╝║
║   ██╔██╗ ██║█████╗  ██╔████╔██║█████╗  ███████╗██║███████╗║
║   ██║╚██╗██║██╔══╝  ██║╚██╔╝██║██╔══╝  ╚════██║██║╚════██║║
║   ██║ ╚████║███████╗██║ ╚═╝ ██║███████╗███████║██║███████║║
║   ╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝╚══════╝╚══════╝╚═╝╚══════╝║
║                                                          ║
║   AI Red Team — LLM-Powered Penetration Testing          ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`;

/**
 * Phase 1: Recon — crawl and map the target. Returns structured data
 * for the LLM to analyze and generate attack plans.
 */
export async function runRecon(config: NemesisConfig): Promise<{ pages: PageMap[]; recon: Recon }> {
  console.error(BANNER);

  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.screenshotDir, { recursive: true });

  console.error(`[Phase 1] RECON — Crawling ${config.targetUrl}`);
  console.error(`  Max pages: ${config.maxPages}`);

  const recon = new Recon(config);
  await recon.launch();

  let pages: PageMap[];
  try {
    pages = await recon.crawl();
  } catch (e) {
    await recon.close();
    throw e;
  }

  const totalForms = pages.reduce((s, p) => s + p.forms.length, 0);
  const totalInputs = pages.reduce((s, p) => s + p.inputs.length + p.forms.reduce((fs, f) => fs + f.inputs.length, 0), 0);
  const totalLinks = pages.reduce((s, p) => s + p.links.length, 0);

  console.error(`  Discovered: ${pages.length} pages, ${totalForms} forms, ${totalInputs} inputs, ${totalLinks} links`);

  return { pages, recon };
}

/**
 * Phase 2+3: Execute LLM-generated attack plans and produce report.
 * The attack plans come entirely from the LLM — no hardcoded patterns.
 */
export async function runAttacks(
  recon: Recon,
  config: NemesisConfig,
  pages: PageMap[],
  plans: AttackPlan[],
  startedAt: string,
): Promise<NemesisReport> {
  const startTime = new Date(startedAt).getTime();

  const totalAttacks = plans.reduce((s, p) => s + p.attacks.length, 0);
  console.error(`\n[Phase 2] ATTACK — Executing ${totalAttacks} LLM-generated attacks`);

  const attacker = new Attacker(recon.getContext(), config);

  let results: AttackResult[];
  try {
    results = await attacker.executeAll(plans);
  } finally {
    await recon.close();
  }

  const vulnerabilities = results.filter((r) => r.success);
  const completedAt = new Date().toISOString();
  const duration = Date.now() - startTime;

  let timeToFirstBreach: number | undefined;
  if (vulnerabilities.length > 0) {
    timeToFirstBreach = new Date(vulnerabilities[0].timestamp).getTime() - startTime;
  }

  // ─── Phase 3: Reporting ────────────────────────────────────────────
  console.error(`\n[Phase 3] REPORT — Generating penetration test report`);

  const report: NemesisReport = {
    target: config.targetUrl,
    startedAt,
    completedAt,
    duration,
    pagesScanned: pages.length,
    attacksExecuted: results.length,
    vulnerabilitiesFound: vulnerabilities.length,
    criticalCount: vulnerabilities.filter((v) => v.attack.severity === 'critical').length,
    highCount: vulnerabilities.filter((v) => v.attack.severity === 'high').length,
    mediumCount: vulnerabilities.filter((v) => v.attack.severity === 'medium').length,
    lowCount: vulnerabilities.filter((v) => v.attack.severity === 'low').length,
    pages,
    results,
    timeToFirstBreach,
  };

  const mdPath = path.join(config.outputDir, 'SENTINEL-REPORT.md');
  const htmlPath = path.join(config.outputDir, 'SENTINEL-REPORT.html');
  const jsonPath = path.join(config.outputDir, 'sentinel-results.json');
  const sarifPath = path.join(config.outputDir, 'sentinel-results.sarif');

  fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf-8');
  fs.writeFileSync(htmlPath, generateHtmlReport(report), 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(sarifPath, generateSarifReport(report), 'utf-8');

  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  TARGET:          ${config.targetUrl}`);
  console.error(`  DURATION:        ${(duration / 1000).toFixed(1)}s`);
  console.error(`  PAGES SCANNED:   ${pages.length}`);
  console.error(`  ATTACKS RUN:     ${results.length}`);
  console.error(`  VULNERABILITIES: ${vulnerabilities.length}`);
  if (vulnerabilities.length > 0) {
    console.error(`    Critical: ${report.criticalCount}  High: ${report.highCount}  Medium: ${report.mediumCount}  Low: ${report.lowCount}`);
    if (timeToFirstBreach !== undefined) {
      console.error(`  TIME TO BREACH:  ${(timeToFirstBreach / 1000).toFixed(1)}s`);
    }
  }
  console.error(`  REPORTS:         ${config.outputDir}/`);
  console.error(`${'═'.repeat(60)}\n`);

  return report;
}
