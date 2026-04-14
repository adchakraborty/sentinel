import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { NemesisConfig, AttackPlan, PageMap } from './types.js';
import { Recon } from './core/recon.js';
import { runRecon, runAttacks } from './core/orchestrator.js';
import { launchDemoApp, stopDemoApp, findFreePort } from './launcher.js';

import {
  loadKnowledge, saveKnowledge, addScanRecord,
  addEffectivePayloads, addTestPlan, getKnowledgeSummary,
  getKnowledgeForUrl, upsertAppProfile, urlToKey,
  KnowledgeBase, AppProfile, EffectivePayload, TestPlan,
} from './memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: 'nemesis',
  version: '3.0.0',
});

const CATEGORY_ENUM = z.enum([
  'injection', 'xss', 'auth', 'traversal', 'validation',
  'dos', 'cors', 'csrf', 'storage', 'functional', 'exploratory',
]);

const AUTH_SCHEMA = z.object({
  type: z.enum(['form-login', 'idp-login', 'cookie', 'bearer', 'basic', 'none']).describe('Authentication method'),
  loginUrl: z.string().optional().describe('Login page URL (for form-login)'),
  username: z.string().optional().describe('Username or email'),
  password: z.string().optional().describe('Password'),
  token: z.string().optional().describe('Bearer token (for bearer auth)'),
  cookies: z.record(z.string()).optional().describe('Cookie name:value pairs (for cookie auth)'),
  usernameField: z.string().optional().describe('CSS selector for username input (default: auto-detect)'),
  passwordField: z.string().optional().describe('CSS selector for password input (default: auto-detect)'),
  loginTrigger: z.string().optional().describe('CSS selector for the button that initiates IDP redirect (for idp-login, e.g. "button[mat-stroked-button]")'),
  consentButton: z.string().optional().describe('CSS selector or text for the consent/accept button on the IDP consent page (for idp-login)'),
  postLoginUrlPattern: z.string().optional().describe('URL substring to wait for after IDP login completes (for idp-login, e.g. "/home")'),
}).optional().describe('Authentication credentials for the target app. The browser will authenticate before crawling.');

// ─── Shared state ────────────────────────────────────────────────────
let activeRecon: Recon | null = null;
let activePages: PageMap[] = [];
let activeConfig: NemesisConfig | null = null;
let activeStartedAt: string = '';
let activeDocContent: string = '';
let activeExampleData: Record<string, string> = {};
let demoLaunched = false;
let kb: KnowledgeBase = loadKnowledge();

// ═══════════════════════════════════════════════════════════════════════
// TOOL 1: nemesis_recon
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  'nemesis_recon',
  `Crawl a web application and map its attack surface. Returns pages, forms, inputs, cookies, browser storage (localStorage, sessionStorage, IndexedDB), headers, links, plus any knowledge from past runs for this specific URL.

Supports authentication: pass auth credentials and the browser will log in before crawling.
Supports documentation: pass a docPath and NEMESIS reads the file, returning its content for YOU to analyze.
Supports example data: pass exampleData with sample inputs for functional testing.

After calling this, YOU (the LLM) must:
1. Read the documentation content (if provided) and understand the app
2. Analyze the recon data using your security AND QA expertise — including browser storage for sensitive data exposure
3. Use the example data for functional tests, your security knowledge for attacks
4. Call nemesis_attack with your plans`,
  {
    targetUrl: z.string().optional().describe('URL to crawl. Omit if using demo mode.'),
    maxPages: z.number().optional().describe('Max pages to crawl (default: 10)'),
    demo: z.boolean().optional().describe('Launch built-in VulnShop demo app'),
    headed: z.boolean().optional().describe('Show browser visibly'),
    auth: AUTH_SCHEMA,
    docPath: z.string().optional().describe('Path to a documentation file (markdown, text, etc). NEMESIS reads it and returns the content for YOU to analyze.'),
    exampleData: z.record(z.string()).optional().describe('Example data for functional testing, e.g. {"searchQuery": "Widget", "feedbackName": "John", "feedbackMessage": "Great product"}'),
  },
  async ({ targetUrl, maxPages, demo, headed, auth, docPath, exampleData }) => {
    let actualUrl = targetUrl || 'http://localhost:3001';

    if (demo) {
      const port = findFreePort();
      actualUrl = await launchDemoApp(path.resolve(__dirname, '..', 'demo-app'), port);
      demoLaunched = true;
    }

    // Read documentation file if provided
    activeDocContent = '';
    if (docPath) {
      try {
        const resolvedPath = path.resolve(docPath);
        activeDocContent = fs.readFileSync(resolvedPath, 'utf-8');
        console.error(`[nemesis] Read documentation: ${resolvedPath} (${activeDocContent.length} chars)`);
      } catch (e) {
        console.error(`[nemesis] Could not read doc at ${docPath}: ${e instanceof Error ? e.message : e}`);
      }
    }

    activeExampleData = exampleData || {};

    activeStartedAt = new Date().toISOString();
    activeConfig = {
      targetUrl: actualUrl,
      maxPages: maxPages || 10,
      headless: !headed,
      timeout: 15000,
      screenshotDir: './nemesis-results/screenshots',
      outputDir: './nemesis-results',
      auth: auth || undefined,
    };

    const { pages, recon } = await runRecon(activeConfig);
    activeRecon = recon;
    activePages = pages;

    const reconSummary = pages.map((p) => ({
      url: p.url,
      title: p.title,
      forms: p.forms.map((f) => ({
        action: f.action,
        method: f.method,
        selector: f.selector,
        inputs: f.inputs.map((i) => ({
          name: i.name, type: i.type, selector: i.selector,
          placeholder: i.placeholder, label: i.label,
        })),
      })),
      standaloneInputs: p.inputs.map((i) => ({
        name: i.name, type: i.type, selector: i.selector,
        placeholder: i.placeholder, label: i.label,
      })),
      cookies: p.cookies,
      storage: p.storage,
      headers: p.headers,
      internalLinks: p.links.filter((l) => l.isInternal).map((l) => ({ href: l.href, text: l.text })),
    }));

    // Get URL-scoped knowledge
    kb = loadKnowledge();
    const urlKnowledge = getKnowledgeForUrl(kb, actualUrl);

    const content: Array<{ type: 'text'; text: string }> = [];

    // Main instructions
    const instructions = [
      `# NEMESIS Recon Complete`,
      ``,
      `**Target:** ${actualUrl}`,
      `**Pages:** ${pages.length} | **Forms:** ${pages.reduce((s, p) => s + p.forms.length, 0)} | **Inputs:** ${pages.reduce((s, p) => s + p.inputs.length + p.forms.reduce((fs, f) => fs + f.inputs.length, 0), 0)} | **Storage entries:** ${pages.reduce((s, p) => s + p.storage.localStorage.length + p.storage.sessionStorage.length, 0)}`,
      auth ? `**Auth:** ${auth.type}${auth.username ? ` as ${auth.username}` : ''}` : '',
      ``,
      `## What To Do Next`,
      ``,
      `Analyze the recon data and generate test plans. You can create:`,
      `- **Security attacks** (injection, xss, auth, traversal, cors, csrf, storage)`,
      `- **Functional tests** (does search work? does login accept valid creds? does form save data?)`,
      `- **Exploratory tests** (random inputs, edge cases, boundary values)`,
      ``,
      `Then call **nemesis_attack** with your plans.`,
    ];
    content.push({ type: 'text' as const, text: instructions.filter(Boolean).join('\n') });

    // Documentation content
    if (activeDocContent) {
      content.push({
        type: 'text' as const,
        text: `## Application Documentation\n\nThe following documentation was provided. Use it to understand the app and generate smarter, more targeted tests:\n\n---\n\n${activeDocContent}\n\n---`,
      });
    }

    // Example data
    if (Object.keys(activeExampleData).length > 0) {
      content.push({
        type: 'text' as const,
        text: `## Example Data for Testing\n\nUse these values for functional tests:\n\n${JSON.stringify(activeExampleData, null, 2)}`,
      });
    }

    // URL-scoped knowledge from past runs
    if (urlKnowledge.app || urlKnowledge.scans.length > 0 || urlKnowledge.payloads.length > 0) {
      const kbParts = [`## Knowledge for ${actualUrl} (from past runs)\n`];
      if (urlKnowledge.app) {
        kbParts.push(`**App:** ${urlKnowledge.app.name} | **Tech:** ${urlKnowledge.app.techStack.join(', ')} | **Routes:** ${urlKnowledge.app.routes.join(', ')}`);
      }
      if (urlKnowledge.scans.length > 0) {
        const latest = urlKnowledge.scans[urlKnowledge.scans.length - 1];
        kbParts.push(`**Last scan:** ${latest.timestamp} — ${latest.vulnerabilitiesFound} issues found in ${latest.attacksExecuted} tests`);
      }
      if (urlKnowledge.payloads.length > 0) {
        kbParts.push(`\n**Effective payloads from past runs** (use these — they worked before):`);
        for (const p of urlKnowledge.payloads.slice(-10)) {
          kbParts.push(`- [${p.category}] ${p.targetType}: \`${p.payload.slice(0, 80)}\` → indicator: "${p.successIndicator}"`);
        }
      }
      if (urlKnowledge.plans.length > 0) {
        kbParts.push(`\n**Stored test plans:** ${urlKnowledge.plans.map((p) => p.name).join(', ')}`);
      }
      content.push({ type: 'text' as const, text: kbParts.join('\n') });
    }

    // Recon data
    content.push({ type: 'text' as const, text: JSON.stringify(reconSummary, null, 2) });

    return { content };
  },
);

// ═══════════════════════════════════════════════════════════════════════
// TOOL 2: nemesis_attack
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  'nemesis_attack',
  `Execute test plans against the target crawled by nemesis_recon. YOU provide all plans — security attacks, functional tests, exploratory tests. NEMESIS executes them in Chromium and captures evidence.

Categories: injection, xss, auth, traversal, validation, cors, csrf, storage, functional, exploratory

The "storage" category checks browser storage (localStorage, sessionStorage) for sensitive data like tokens, credentials, API keys, PII, or excessive data exposure. Use target type "storage" for these checks.

After results come back, effective payloads and scan records are saved to the knowledge base (scoped to this URL) for future runs.`,
  {
    plans: z.array(z.object({
      pageUrl: z.string().describe('URL of the page to test'),
      attacks: z.array(z.object({
        id: z.string().describe('Unique ID (e.g., ATK-1, QA-1, EXP-1)'),
        category: CATEGORY_ENUM.describe('Test category'),
        name: z.string().describe('Human-readable test name'),
        description: z.string().describe('What this test checks and why'),
        target: z.object({
          type: z.enum(['form', 'url-param', 'header', 'cookie', 'direct-url', 'storage']),
          selector: z.string().optional().describe('CSS selector for form input'),
          inputName: z.string().optional(),
          url: z.string().optional(),
        }),
        payloads: z.array(z.string()).describe('Test inputs/payloads — YOU generate these'),
        successIndicators: z.array(z.string()).describe('Strings indicating the test found something — YOU decide these'),
        severity: z.enum(['critical', 'high', 'medium', 'low']),
      })),
    })),
  },
  async ({ plans }) => {
    if (!activeRecon || !activeConfig) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Call nemesis_recon first.' }],
      };
    }

    try {
      const report = await runAttacks(activeRecon, activeConfig, activePages, plans, activeStartedAt);

      const vulns = report.results.filter((r) => r.success);
      const appKey = urlToKey(report.target);

      // Save scan record scoped to URL
      addScanRecord(kb, {
        id: `scan-${Date.now()}`,
        appId: appKey,
        timestamp: new Date().toISOString(),
        pagesScanned: report.pagesScanned,
        attacksExecuted: report.attacksExecuted,
        vulnerabilitiesFound: report.vulnerabilitiesFound,
        findings: vulns.map((v) => `[${v.attack.severity}] ${v.attack.name}: ${v.evidence.substring(0, 100)}`),
      });

      // Save effective payloads scoped to URL
      const newPayloads: EffectivePayload[] = vulns
        .filter((v) => v.attack.payloads.length > 0)
        .map((v) => ({
          payload: v.attack.payloads[0],
          category: v.attack.category,
          targetType: v.attack.target.type,
          successIndicator: v.attack.successIndicators[0] || '',
          appId: appKey,
          discoveredAt: new Date().toISOString(),
        }));
      if (newPayloads.length > 0) {
        addEffectivePayloads(kb, newPayloads);
      }

      const summary = [
        `# NEMESIS Test Run Complete`,
        ``,
        `**Target:** ${report.target}`,
        `**Duration:** ${(report.duration / 1000).toFixed(1)}s`,
        `**Tests Executed:** ${report.attacksExecuted}`,
        `**Issues Found:** ${report.vulnerabilitiesFound}`,
        ``,
        `| Severity | Count |`,
        `|----------|-------|`,
        `| Critical | ${report.criticalCount} |`,
        `| High     | ${report.highCount} |`,
        `| Medium   | ${report.mediumCount} |`,
        `| Low      | ${report.lowCount} |`,
      ];

      if (report.timeToFirstBreach !== undefined) {
        summary.push(``, `**Time to First Issue:** ${(report.timeToFirstBreach / 1000).toFixed(1)}s`);
      }

      if (vulns.length > 0) {
        summary.push(``, `## Issues Found`, ``);
        for (const v of vulns) {
          summary.push(`- **[${v.attack.severity.toUpperCase()}]** ${v.attack.name}`);
          summary.push(`  Evidence: ${v.evidence.substring(0, 150)}`);
          if (v.screenshot) summary.push(`  Screenshot: ${v.screenshot}`);
        }
      }

      summary.push(``, `## Reports`, ``);
      summary.push(`- Markdown: ${activeConfig.outputDir}/NEMESIS-REPORT.md`);
      summary.push(`- HTML: ${activeConfig.outputDir}/NEMESIS-REPORT.html`);
      summary.push(`- SARIF: ${activeConfig.outputDir}/nemesis-results.sarif`);
      summary.push(``, `_${newPayloads.length} effective payloads saved to knowledge base for ${appKey}._`);

      return {
        content: [
          { type: 'text' as const, text: summary.join('\n') },
          {
            type: 'text' as const,
            text: JSON.stringify({
              vulnerabilitiesFound: report.vulnerabilitiesFound,
              critical: report.criticalCount,
              high: report.highCount,
              medium: report.mediumCount,
              low: report.lowCount,
              results: vulns.map((v) => ({
                name: v.attack.name, category: v.attack.category,
                severity: v.attack.severity, evidence: v.evidence, page: v.pageUrl,
              })),
            }, null, 2),
          },
        ],
      };
    } finally {
      activeRecon = null;
      activePages = [];
      activeConfig = null;
      activeDocContent = '';
      activeExampleData = {};
      if (demoLaunched) { await stopDemoApp(); demoLaunched = false; }
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════
// TOOL 3: nemesis_learn
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  'nemesis_learn',
  `Store application knowledge in the NEMESIS knowledge base, scoped to a specific URL. Call this after reading documentation. Knowledge persists across sessions and makes future scans smarter.

You can store: app profile (tech stack, routes), auth config, example data, and test plans.`,
  {
    appProfile: z.object({
      name: z.string().describe('Application name'),
      url: z.string().describe('Application URL (knowledge is scoped to this)'),
      techStack: z.array(z.string()).describe('Technologies used'),
      routes: z.array(z.string()).describe('Known routes/endpoints'),
      fromDocs: z.string().optional().describe('Which document this was learned from'),
    }).optional(),
    auth: AUTH_SCHEMA,
    exampleData: z.record(z.string()).optional().describe('Example data for functional testing'),
    testPlans: z.array(z.object({
      name: z.string().describe('Test plan name'),
      description: z.string().describe('What this plan tests'),
      steps: z.array(z.object({
        action: z.string(),
        target: z.string(),
        expectedResult: z.string(),
        type: z.enum(['functional', 'security', 'exploratory']),
      })),
      fromDocs: z.string().optional(),
    })).optional(),
  },
  async ({ appProfile, auth, exampleData, testPlans }) => {
    const results: string[] = [];

    if (appProfile) {
      const key = urlToKey(appProfile.url);
      const profile: AppProfile = {
        id: `app-${Date.now()}`,
        ...appProfile,
        urlKey: key,
        learnedAt: new Date().toISOString(),
        auth: auth || undefined,
        exampleData: exampleData || undefined,
      };
      upsertAppProfile(kb, profile);
      results.push(`Stored app profile: **${appProfile.name}** @ ${appProfile.url}`);
      results.push(`  Tech: ${appProfile.techStack.join(', ')}`);
      results.push(`  Routes: ${appProfile.routes.join(', ')}`);
      if (auth) results.push(`  Auth: ${auth.type}${auth.username ? ` (${auth.username})` : ''}`);
      if (exampleData) results.push(`  Example data: ${Object.keys(exampleData).join(', ')}`);
    }

    if (testPlans && testPlans.length > 0) {
      const appId = appProfile ? urlToKey(appProfile.url) : 'unknown';
      for (const plan of testPlans) {
        const tp: TestPlan = {
          id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          appId,
          name: plan.name,
          description: plan.description,
          steps: plan.steps,
          createdAt: new Date().toISOString(),
          fromDocs: plan.fromDocs,
        };
        addTestPlan(kb, tp);
        results.push(`Stored test plan: **${plan.name}** (${plan.steps.length} steps)`);
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: [
          `# Knowledge Stored`,
          ``,
          ...results,
          ``,
          `Total: ${kb.apps.length} apps, ${kb.scanHistory.length} scans, ${kb.effectivePayloads.length} payloads, ${kb.testPlans.length} plans`,
        ].join('\n'),
      }],
    };
  },
);

// ═══════════════════════════════════════════════════════════════════════
// TOOL 4: nemesis_knowledge
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  'nemesis_knowledge',
  `Query the NEMESIS knowledge base. Optionally scope to a specific URL to see only that app's knowledge.`,
  {
    url: z.string().optional().describe('Filter knowledge to this URL only'),
  },
  async ({ url }) => {
    kb = loadKnowledge();

    if (url) {
      const k = getKnowledgeForUrl(kb, url);
      const parts = [`# Knowledge for ${url}\n`];
      if (k.app) {
        parts.push(`**App:** ${k.app.name} | **Tech:** ${k.app.techStack.join(', ')}`);
        parts.push(`**Routes:** ${k.app.routes.join(', ')}`);
        if (k.app.auth) parts.push(`**Auth:** ${k.app.auth.type}${k.app.auth.username ? ` (${k.app.auth.username})` : ''}`);
        if (k.app.exampleData) parts.push(`**Example data:** ${JSON.stringify(k.app.exampleData)}`);
      }
      parts.push(`**Scans:** ${k.scans.length} | **Effective payloads:** ${k.payloads.length} | **Test plans:** ${k.plans.length}`);

      return {
        content: [
          { type: 'text' as const, text: parts.join('\n') },
          { type: 'text' as const, text: JSON.stringify(k, null, 2) },
        ],
      };
    }

    const summary = getKnowledgeSummary(kb);
    return {
      content: [
        { type: 'text' as const, text: summary || 'Knowledge base is empty.' },
        {
          type: 'text' as const,
          text: JSON.stringify({
            apps: kb.apps.length, scans: kb.scanHistory.length,
            effectivePayloads: kb.effectivePayloads.length, testPlans: kb.testPlans.length,
            details: { apps: kb.apps, recentScans: kb.scanHistory.slice(-5), topPayloads: kb.effectivePayloads.slice(-20), testPlans: kb.testPlans },
          }, null, 2),
        },
      ],
    };
  },
);

// ═══════════════════════════════════════════════════════════════════════
// TOOL 5: nemesis_scan (unified convenience tool)
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  'nemesis_scan',
  `Full scan pipeline in one call: crawl the target, return recon data (including browser storage: localStorage, sessionStorage, IndexedDB) + documentation + example data + past knowledge. This is the recommended entry point.

After this returns, YOU must:
1. Read the documentation (if provided)
2. Analyze the recon data — including browser storage entries for sensitive data exposure (tokens, credentials, PII, API keys)
3. Generate security attacks + functional tests + exploratory tests + browser storage vulnerability checks
4. Call nemesis_attack with your plans

This tool combines nemesis_recon + doc reading + knowledge lookup into one step.`,
  {
    targetUrl: z.string().describe('URL to scan (e.g., http://localhost:3000)'),
    docPath: z.string().optional().describe('Path to documentation file (markdown, text). NEMESIS reads it and returns content for YOU.'),
    auth: AUTH_SCHEMA,
    exampleData: z.record(z.string()).optional().describe('Example data for functional testing, e.g. {"searchQuery": "Widget", "username": "admin", "password": "admin"}'),
    maxPages: z.number().optional().describe('Max pages to crawl (default: 10)'),
    headed: z.boolean().optional().describe('Show browser visibly'),
  },
  async ({ targetUrl, docPath, auth, exampleData, maxPages, headed }) => {
    let actualUrl = targetUrl;

    activeDocContent = '';
    if (docPath) {
      try {
        const resolvedPath = path.resolve(docPath);
        activeDocContent = fs.readFileSync(resolvedPath, 'utf-8');
        console.error(`[nemesis] Read documentation: ${resolvedPath} (${activeDocContent.length} chars)`);
      } catch (e) {
        console.error(`[nemesis] Could not read doc at ${docPath}: ${e instanceof Error ? e.message : e}`);
      }
    }

    activeExampleData = exampleData || {};

    activeStartedAt = new Date().toISOString();
    activeConfig = {
      targetUrl: actualUrl,
      maxPages: maxPages || 10,
      headless: !headed,
      timeout: 15000,
      screenshotDir: './nemesis-results/screenshots',
      outputDir: './nemesis-results',
      auth: auth || undefined,
    };

    const { pages, recon } = await runRecon(activeConfig);
    activeRecon = recon;
    activePages = pages;

    const reconSummary = pages.map((p) => ({
      url: p.url,
      title: p.title,
      forms: p.forms.map((f) => ({
        action: f.action, method: f.method, selector: f.selector,
        inputs: f.inputs.map((i) => ({ name: i.name, type: i.type, selector: i.selector, placeholder: i.placeholder, label: i.label })),
      })),
      standaloneInputs: p.inputs.map((i) => ({ name: i.name, type: i.type, selector: i.selector, placeholder: i.placeholder, label: i.label })),
      cookies: p.cookies,
      storage: p.storage,
      headers: p.headers,
      internalLinks: p.links.filter((l) => l.isInternal).map((l) => ({ href: l.href, text: l.text })),
    }));

    kb = loadKnowledge();
    const urlKnowledge = getKnowledgeForUrl(kb, actualUrl);

    const content: Array<{ type: 'text'; text: string }> = [];

    const instructions = [
      `# NEMESIS Scan — ${actualUrl}`,
      ``,
      `**Pages:** ${pages.length} | **Forms:** ${pages.reduce((s, p) => s + p.forms.length, 0)} | **Inputs:** ${pages.reduce((s, p) => s + p.inputs.length + p.forms.reduce((fs, f) => fs + f.inputs.length, 0), 0)} | **Storage entries:** ${pages.reduce((s, p) => s + p.storage.localStorage.length + p.storage.sessionStorage.length, 0)}`,
      auth ? `**Auth:** ${auth.type}${auth.username ? ` as ${auth.username}` : ''}` : '',
      docPath ? `**Docs:** ${docPath}` : '',
      ``,
      `## Your Task`,
      ``,
      `1. Read the documentation below (if provided)`,
      `2. Analyze the recon data — every form, input, cookie, header, and browser storage entry`,
      `3. Generate test plans:`,
      `   - **Security attacks**: SQLi, XSS, auth bypass, path traversal, CORS, CSRF, browser storage vulnerabilities`,
      `   - **Functional tests**: Use the example data to verify features work correctly`,
      `   - **Exploratory tests**: Edge cases, boundary values, random inputs`,
      `4. Call **nemesis_attack** with your plans`,
    ];
    content.push({ type: 'text' as const, text: instructions.filter(Boolean).join('\n') });

    if (activeDocContent) {
      content.push({ type: 'text' as const, text: `## Application Documentation\n\n---\n\n${activeDocContent}\n\n---` });
    }

    if (Object.keys(activeExampleData).length > 0) {
      content.push({ type: 'text' as const, text: `## Example Data\n\n\`\`\`json\n${JSON.stringify(activeExampleData, null, 2)}\n\`\`\`` });
    }

    if (urlKnowledge.app || urlKnowledge.scans.length > 0 || urlKnowledge.payloads.length > 0) {
      const kbParts = [`## Past Knowledge for ${actualUrl}\n`];
      if (urlKnowledge.app) kbParts.push(`**App:** ${urlKnowledge.app.name} | **Tech:** ${urlKnowledge.app.techStack.join(', ')}`);
      if (urlKnowledge.scans.length > 0) {
        const latest = urlKnowledge.scans[urlKnowledge.scans.length - 1];
        kbParts.push(`**Last scan:** ${latest.timestamp} — ${latest.vulnerabilitiesFound} issues in ${latest.attacksExecuted} tests`);
      }
      if (urlKnowledge.payloads.length > 0) {
        kbParts.push(`\n**Effective payloads (reuse these):**`);
        for (const p of urlKnowledge.payloads.slice(-10)) {
          kbParts.push(`- [${p.category}] \`${p.payload.slice(0, 80)}\` → "${p.successIndicator}"`);
        }
      }
      content.push({ type: 'text' as const, text: kbParts.join('\n') });
    }

    content.push({ type: 'text' as const, text: JSON.stringify(reconSummary, null, 2) });

    return { content };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error('NEMESIS MCP server error:', e);
  process.exit(1);
});
