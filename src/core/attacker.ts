import { BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import {
  Attack, AttackResult, AttackPlan, NemesisConfig, PageMap,
} from '../types.js';

/**
 * Attacker module — takes attack plans and executes them against
 * the live application using a real browser. Captures evidence
 * (screenshots, response data, console errors) for every finding.
 */
export class Attacker {
  private context: BrowserContext;
  private config: NemesisConfig;
  private results: AttackResult[] = [];

  onAttackStart?: (attack: Attack) => void;
  onAttackResult?: (result: AttackResult) => void;

  constructor(context: BrowserContext, config: NemesisConfig) {
    this.context = context;
    this.config = config;
  }

  async executeAll(plans: AttackPlan[]): Promise<AttackResult[]> {
    for (const plan of plans) {
      const planResults = await this.executePlan(plan);
      this.results.push(...planResults);
    }
    return this.results;
  }

  private async executePlan(plan: AttackPlan): Promise<AttackResult[]> {
    const results: AttackResult[] = [];

    for (const attack of plan.attacks) {
      try {
        this.onAttackStart?.(attack);
        const result = await this.executeAttack(attack, plan.pageUrl);
        results.push(result);
        this.onAttackResult?.(result);

        if (result.success) {
          console.error(`  [VULN] ${attack.name} — ${result.evidence.substring(0, 80)}`);
        }
      } catch (e) {
        results.push({
          attack,
          pageUrl: plan.pageUrl,
          success: false,
          evidence: `Execution error: ${e instanceof Error ? e.message : e}`,
          duration: 0,
          reproductionSteps: [],
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  private async executeAttack(attack: Attack, pageUrl: string): Promise<AttackResult> {
    switch (attack.category) {
      case 'injection':
      case 'xss':
      case 'validation':
        return this.executeInputAttack(attack, pageUrl);
      case 'auth':
        return this.executeAuthAttack(attack, pageUrl);
      case 'traversal':
        return this.executeTraversalAttack(attack, pageUrl);
      case 'cors':
        return this.executeCorsCheck(attack, pageUrl);
      case 'csrf':
        return this.executeCsrfCheck(attack, pageUrl);
      case 'storage':
        return this.executeStorageCheck(attack, pageUrl);
      case 'ssrf':
      case 'redirect':
        return this.executeSsrfOrRedirectCheck(attack, pageUrl);
      case 'idor':
      case 'info-leak':
        return this.executeApiCheck(attack, pageUrl);
      case 'accessibility':
        return this.executeAccessibilityCheck(attack, pageUrl);
      case 'ux':
        return this.executeUxCheck(attack, pageUrl);
      case 'functional':
      case 'exploratory':
        return this.executeFunctionalTest(attack, pageUrl);
      default:
        return this.executeInputAttack(attack, pageUrl);
    }
  }

  private async executeInputAttack(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      steps.push(`Navigate to ${pageUrl}`);
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });

      const bodyBefore = await page.evaluate(() => document.body?.innerText || '');

      for (const payload of attack.payloads.slice(0, 5)) {
        steps.push(`Enter payload: ${payload.substring(0, 60)}`);

        if (attack.target.selector) {
          try {
            await page.fill(attack.target.selector, payload, { timeout: 3000 });
          } catch {
            try {
              await page.locator(attack.target.selector).first().fill(payload, { timeout: 3000 });
            } catch {
              continue;
            }
          }

          try {
            await page.keyboard.press('Enter');
            steps.push('Submit via Enter key');
          } catch { /* continue */ }

          await page.waitForTimeout(1000);

          const bodyText = await page.evaluate(() => document.body?.innerText || '');
          const bodyHtml = await page.evaluate(() => document.body?.innerHTML || '');
          const bodyLower = bodyText.toLowerCase();

          for (const indicator of attack.successIndicators) {
            if (bodyLower.includes(indicator.toLowerCase())) {
              success = true;
              evidence = `Indicator "${indicator}" found in response after payload: ${payload}`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push(`VULNERABILITY CONFIRMED: "${indicator}" detected in page`);
              break;
            }
          }

          if (!success && attack.category === 'injection') {
            const sqliSignals = [
              'sql', 'syntax error', 'mysql', 'sqlite', 'postgresql', 'oracle',
              'unclosed quotation', 'unterminated', 'query', 'database',
              'table', 'column', 'select', 'union', 'where', 'from',
              'error in your sql', 'sqlstate', 'odbc', 'jdbc',
            ];
            const newContent = bodyLower.replace(bodyBefore.toLowerCase(), '');
            for (const signal of sqliSignals) {
              if (newContent.includes(signal) || (bodyLower.includes(signal) && !bodyBefore.toLowerCase().includes(signal))) {
                success = true;
                evidence = `SQL injection indicator "${signal}" appeared after payload: ${payload}`;
                screenshot = await this.takeScreenshot(page, attack.id, payload);
                steps.push(`VULNERABILITY CONFIRMED: SQL error/data leaked`);
                break;
              }
            }
            if (!success && payload.includes("' OR") && bodyText.length > bodyBefore.length + 100) {
              success = true;
              evidence = `SQL injection likely: response grew significantly (${bodyBefore.length} → ${bodyText.length} chars) after payload: ${payload}`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push(`VULNERABILITY CONFIRMED: Response size increase suggests data dump`);
            }
          }

          if (!success && attack.category === 'xss') {
            const hasInjectedHtml = await page.evaluate((p) => {
              return document.body?.innerHTML?.includes(p) || false;
            }, payload);
            if (hasInjectedHtml) {
              success = true;
              evidence = `XSS payload reflected in DOM: ${payload}`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push('VULNERABILITY CONFIRMED: Payload reflected in DOM');
              break;
            }
            const xssPatterns = ['<script', 'onerror=', 'onload=', 'javascript:', 'alert('];
            for (const pat of xssPatterns) {
              if (payload.toLowerCase().includes(pat) && bodyHtml.toLowerCase().includes(pat)) {
                success = true;
                evidence = `XSS: payload pattern "${pat}" reflected in page HTML after input: ${payload}`;
                screenshot = await this.takeScreenshot(page, attack.id, payload);
                steps.push('VULNERABILITY CONFIRMED: XSS pattern reflected in HTML');
                break;
              }
            }
          }

          if (!success && attack.category === 'validation') {
            const errorSignals = ['error', 'exception', 'stack trace', 'internal server', '500', 'unhandled', 'crash'];
            for (const signal of errorSignals) {
              if (bodyLower.includes(signal) && !bodyBefore.toLowerCase().includes(signal)) {
                success = true;
                evidence = `Input validation failure: "${signal}" appeared after payload: ${payload}`;
                screenshot = await this.takeScreenshot(page, attack.id, payload);
                steps.push(`VULNERABILITY CONFIRMED: Application error on malformed input`);
                break;
              }
            }
          }

          if (success) break;
        }
      }

      if (!success && consoleErrors.length > 0) {
        const relevantErrors = consoleErrors.filter((e) =>
          attack.successIndicators.some((ind) => e.toLowerCase().includes(ind.toLowerCase())),
        );
        if (relevantErrors.length > 0) {
          success = true;
          evidence = `Console error triggered: ${relevantErrors[0]}`;
          screenshot = await this.takeScreenshot(page, attack.id, 'console-error');
        }
      }
    } finally {
      await page.close();
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'No vulnerability indicators detected',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeAuthAttack(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    if (attack.name.includes('Brute-force')) {
      return this.executeBruteForce(attack, pageUrl);
    }

    const freshContext = await this.context.browser()!.newContext({
      ignoreHTTPSErrors: true,
    });
    const cleanPage = await freshContext.newPage();

    try {
      {
        for (const targetUrl of attack.payloads.slice(0, 6)) {
          steps.push(`Access ${targetUrl} without any authentication`);
          const response = await cleanPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
          const status = response?.status() || 0;

          await cleanPage.waitForTimeout(2000);

          const finalUrl = cleanPage.url();
          steps.push(`Final URL after client-side routing: ${finalUrl}`);

          const wasRedirectedToLogin = finalUrl.toLowerCase().includes('login') ||
            finalUrl.toLowerCase().includes('auth') ||
            finalUrl.toLowerCase().includes('/home');
          const gotForbidden = status === 401 || status === 403;

          const requestedPath = new URL(targetUrl).pathname;
          const finalPath = new URL(finalUrl).pathname;
          const wasClientRedirected = requestedPath !== finalPath;

          if (wasClientRedirected) {
            steps.push(`SPA client-side redirect detected: ${requestedPath} → ${finalPath}`);
          }

          if (gotForbidden) {
            steps.push(`Server returned ${status} — auth enforced`);
            continue;
          }

          if (wasRedirectedToLogin || wasClientRedirected) {
            steps.push(`Redirected away from protected route — auth enforced`);
            continue;
          }

          if (status === 200) {
            const bodyText = await cleanPage.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
            const bodyHtml = await cleanPage.evaluate(() => document.body?.innerHTML?.substring(0, 5000) || '');

            const isSpaShell = this.detectSpaShell(bodyHtml, bodyText);
            if (isSpaShell) {
              steps.push(`Page returned 200 but content is a generic SPA shell (no sensitive data) — not a real bypass`);
              continue;
            }

            const hasContent = attack.successIndicators.some((ind) =>
              bodyText.toLowerCase().includes(ind.toLowerCase()),
            );
            if (hasContent) {
              success = true;
              evidence = `Sensitive page accessible without authentication at ${targetUrl} (status ${status}). Content indicators found and page contains real data (not just an SPA shell).`;
              screenshot = await this.takeScreenshot(cleanPage, attack.id, 'no-auth');
              steps.push(`VULNERABILITY CONFIRMED: Page returned ${status} with sensitive content`);
              break;
            }
          }
        }
      }
    } finally {
      await freshContext.close();
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'Authentication appears to be enforced (server-side or client-side redirect detected)',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detect if a page is just a generic SPA shell (e.g. Angular/React/Vue app
   * that serves the same index.html for all routes). These return 200 but
   * contain no actual sensitive data — the real content loads via JS + API calls.
   */
  private detectSpaShell(html: string, text: string): boolean {
    const htmlLower = html.toLowerCase();
    const textTrimmed = text.trim();

    const spaRootIndicators = [
      '<app-root',
      '<div id="root"',
      '<div id="app"',
      '<div id="__next"',
      '<div id="__nuxt"',
      'ng-version=',
      'data-reactroot',
      'data-v-',
    ];
    const hasSpaRoot = spaRootIndicators.some((ind) => htmlLower.includes(ind));

    const hasMinimalText = textTrimmed.length < 200;

    const hasScriptBundles = (htmlLower.match(/<script[^>]*src=/g) || []).length >= 2;

    if (hasSpaRoot && hasMinimalText) return true;
    if (hasSpaRoot && hasScriptBundles && hasMinimalText) return true;

    return false;
  }

  private async executeBruteForce(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [`Navigate to ${pageUrl}`];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    for (const combo of attack.payloads.slice(0, 5)) {
      const [user, pass] = combo.split(':');
      const page = await this.context.newPage();

      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
        steps.push(`Try credentials: ${user}:${'*'.repeat(pass.length)}`);

        const passwordInput = page.locator('input[type="password"]').first();
        const usernameInput = page.locator('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]').first();

        try {
          await usernameInput.fill(user, { timeout: 3000 });
          await passwordInput.fill(pass, { timeout: 3000 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);

          const finalUrl = page.url();
          const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');

          const loginSuccess = !finalUrl.toLowerCase().includes('login') &&
            attack.successIndicators.some((ind) => bodyText.toLowerCase().includes(ind.toLowerCase()));

          if (loginSuccess) {
            success = true;
            evidence = `Login succeeded with ${user}:${pass}`;
            screenshot = await this.takeScreenshot(page, attack.id, `brute-${user}`);
            steps.push(`VULNERABILITY CONFIRMED: Login succeeded with weak credentials`);
            break;
          }
        } catch { /* form interaction failed, skip */ }
      } finally {
        await page.close();
      }
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'Common credentials rejected',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeTraversalAttack(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      for (const payload of attack.payloads.slice(0, 5)) {
        const testUrl = injectPayloadIntoUrl(pageUrl, payload);
        steps.push(`Request: ${testUrl}`);

        try {
          const response = await page.goto(testUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
          const status = response?.status() || 0;
          const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');
          const bodyLower = bodyText.toLowerCase();

          for (const indicator of attack.successIndicators) {
            if (bodyLower.includes(indicator.toLowerCase())) {
              success = true;
              evidence = `Path traversal successful: "${indicator}" found with payload: ${payload}`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push(`VULNERABILITY CONFIRMED: System file content detected`);
              break;
            }
          }
          if (success) break;

          if (!success && status === 200 && bodyText.length > 20) {
            const fileContentSignals = [
              /\{[\s\S]*"name"\s*:[\s\S]*"version"\s*:/,
              /root:.*:0:0/,
              /\[boot loader\]/i,
              /\[extensions\]/i,
              /<\?xml/,
              /<!DOCTYPE/i,
              /"dependencies"\s*:\s*\{/,
              /"scripts"\s*:\s*\{/,
              /module\.exports/,
              /require\s*\(/,
            ];
            for (const pattern of fileContentSignals) {
              if (pattern.test(bodyText)) {
                success = true;
                evidence = `Path traversal: file content detected (pattern: ${pattern.source}) with payload: ${payload}. Preview: ${bodyText.substring(0, 200)}`;
                screenshot = await this.takeScreenshot(page, attack.id, payload);
                steps.push(`VULNERABILITY CONFIRMED: File content exposed via traversal`);
                break;
              }
            }
          }
          if (success) break;
        } catch { /* timeout or nav error */ }
      }
    } finally {
      await page.close();
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'Path traversal payloads did not expose system files',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeCorsCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;

    const targetUrl = attack.target.url || pageUrl;

    for (const payload of attack.payloads.slice(0, 5)) {
      const origin = payload.replace(/^Origin:\s*/i, '').trim();
      steps.push(`Send request to ${targetUrl} with Origin: ${origin}`);

      try {
        const page = await this.context.newPage();
        try {
          const response = await page.request.fetch(targetUrl, {
            headers: { 'Origin': origin },
          });

          const acao = response.headers()['access-control-allow-origin'] || '';
          const acac = response.headers()['access-control-allow-credentials'] || '';

          steps.push(`Response Access-Control-Allow-Origin: "${acao}", Access-Control-Allow-Credentials: "${acac}"`);

          const reflected = acao === origin || acao === 'null';
          const wildcard = acao === '*';
          const credentialed = acac.toLowerCase() === 'true';

          if (reflected && credentialed) {
            success = true;
            evidence = `CORS origin "${origin}" reflected with credentials enabled (ACAO: ${acao}, ACAC: ${acac})`;
            steps.push(`VULNERABILITY CONFIRMED: Origin reflected with credentials`);
            break;
          } else if (wildcard && credentialed) {
            success = true;
            evidence = `Wildcard CORS with credentials enabled (ACAO: *, ACAC: ${acac}). Browsers block this combo, but it signals misconfiguration.`;
            steps.push(`VULNERABILITY CONFIRMED: Wildcard + credentials misconfiguration`);
            break;
          } else if (reflected) {
            success = true;
            evidence = `CORS origin "${origin}" reflected without credentials (ACAO: ${acao}). Lower risk but still a misconfiguration.`;
            steps.push(`ISSUE FOUND: Origin reflected`);
            break;
          } else if (wildcard) {
            success = true;
            evidence = `Wildcard CORS (ACAO: *) — any origin can read responses. Misconfiguration if API returns sensitive data.`;
            steps.push(`ISSUE FOUND: Wildcard CORS allows any origin`);
            break;
          }
        } finally {
          await page.close();
        }
      } catch {
        steps.push(`Request failed for origin ${origin}`);
      }
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'CORS headers are properly configured — no origin reflection detected',
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeFunctionalTest(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      const targetUrl = attack.target.url || pageUrl;
      steps.push(`Navigate to ${targetUrl}`);
      const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
      const status = response?.status() || 0;

      if (attack.target.selector) {
        for (const payload of attack.payloads.slice(0, 5)) {
          steps.push(`Enter: ${payload.substring(0, 60)}`);
          try {
            await page.fill(attack.target.selector, payload, { timeout: 3000 });
          } catch {
            try {
              await page.locator(attack.target.selector).first().fill(payload, { timeout: 3000 });
            } catch { continue; }
          }

          try {
            await page.keyboard.press('Enter');
            steps.push('Submit');
          } catch { /* continue */ }

          await page.waitForTimeout(1500);

          const bodyText = await page.evaluate(() => document.body?.innerText || '');
          const bodyLower = bodyText.toLowerCase();

          for (const indicator of attack.successIndicators) {
            if (bodyLower.includes(indicator.toLowerCase())) {
              success = true;
              evidence = `Found "${indicator}" after input "${payload}" (status ${status})`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push(`ISSUE FOUND: "${indicator}" detected`);
              break;
            }
          }

          if (!success) {
            const hasIndicatorAbsent = attack.successIndicators.some((ind) =>
              ind.startsWith('!') && !bodyLower.includes(ind.slice(1).toLowerCase()),
            );
            if (hasIndicatorAbsent) {
              const missing = attack.successIndicators.find((ind) => ind.startsWith('!'));
              success = true;
              evidence = `Expected content "${missing?.slice(1)}" NOT found after input "${payload}" (status ${status})`;
              screenshot = await this.takeScreenshot(page, attack.id, payload);
              steps.push(`ISSUE FOUND: Expected content missing`);
            }
          }

          if (success) break;
        }
      } else {
        const bodyText = await page.evaluate(() => document.body?.innerText || '');
        const bodyLower = bodyText.toLowerCase();

        for (const indicator of attack.successIndicators) {
          if (indicator.startsWith('!')) {
            if (!bodyLower.includes(indicator.slice(1).toLowerCase())) {
              success = true;
              evidence = `Expected content "${indicator.slice(1)}" NOT found on page (status ${status})`;
              screenshot = await this.takeScreenshot(page, attack.id, 'missing-content');
              break;
            }
          } else if (bodyLower.includes(indicator.toLowerCase())) {
            success = true;
            evidence = `Found "${indicator}" on page (status ${status})`;
            screenshot = await this.takeScreenshot(page, attack.id, 'content-found');
            break;
          }
        }

        if (!success && (status >= 400 || status === 0)) {
          success = true;
          evidence = `Page returned error status ${status}`;
          screenshot = await this.takeScreenshot(page, attack.id, `status-${status}`);
        }
      }

      if (!success && consoleErrors.length > 0) {
        success = true;
        evidence = `Console errors detected: ${consoleErrors[0]}`;
        screenshot = await this.takeScreenshot(page, attack.id, 'console-error');
      }
    } finally {
      await page.close();
    }

    return {
      attack, pageUrl, success, evidence: evidence || 'Test passed — no issues detected',
      screenshot, duration: Date.now() - start, reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeCsrfCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;

    const targetUrl = attack.target.url || pageUrl;

    try {
      const page = await this.context.newPage();
      try {
        steps.push(`Send state-changing POST to ${targetUrl} without CSRF token`);

        const postResponse = await page.request.fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: '{}',
        });

        const postStatus = postResponse.status();
        steps.push(`POST response status: ${postStatus}`);

        if (postStatus === 403 || postStatus === 401) {
          evidence = `CSRF protection is active — POST without token returned ${postStatus}`;
          steps.push(`CSRF protection verified: ${postStatus} response`);
        } else if (postStatus >= 200 && postStatus < 300) {
          const deleteResponse = await page.request.fetch(targetUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          const deleteStatus = deleteResponse.status();
          steps.push(`DELETE without CSRF token returned: ${deleteStatus}`);

          if (deleteStatus === 403 || deleteStatus === 401) {
            evidence = `CSRF partially enforced — POST returned ${postStatus} but DELETE returned ${deleteStatus}`;
            steps.push(`CSRF protection verified on DELETE`);
          } else if (deleteStatus >= 200 && deleteStatus < 300) {
            success = true;
            evidence = `Possible CSRF vulnerability — both POST (${postStatus}) and DELETE (${deleteStatus}) accepted without CSRF token`;
            steps.push(`VULNERABILITY CONFIRMED: State-changing requests accepted without CSRF token`);
          } else {
            success = true;
            evidence = `Possible CSRF vulnerability — POST without CSRF token returned ${postStatus}`;
            steps.push(`VULNERABILITY CONFIRMED: POST accepted without CSRF token`);
          }
        } else {
          evidence = `CSRF check inconclusive — POST returned ${postStatus}`;
        }
      } finally {
        await page.close();
      }
    } catch (e) {
      evidence = `CSRF check failed: ${e instanceof Error ? e.message : e}`;
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'CSRF protection appears to be in place',
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeStorageCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      const targetUrl = attack.target.url || pageUrl;
      steps.push(`Navigate to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
      await page.waitForTimeout(1000);

      const storageData = await page.evaluate(() => {
        const sensitivePatterns = [
          /token/i, /auth/i, /session/i, /password/i, /passwd/i, /secret/i,
          /api[_-]?key/i, /access[_-]?key/i, /private[_-]?key/i, /credential/i,
          /jwt/i, /bearer/i, /oauth/i, /refresh/i, /csrf/i, /xsrf/i,
          /credit.?card/i, /ssn/i, /social.?security/i, /pin/i,
          /^eyJ/,
        ];

        const checkStore = (store: Storage, storeName: string) => {
          const findings: Array<{ store: string; key: string; value: string; reason: string }> = [];
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key) continue;
            const value = store.getItem(key) || '';

            for (const pattern of sensitivePatterns) {
              if (pattern.test(key) || pattern.test(value)) {
                findings.push({
                  store: storeName,
                  key,
                  value: value.substring(0, 100),
                  reason: `Matches sensitive pattern: ${pattern.source}`,
                });
                break;
              }
            }
          }
          return findings;
        };

        const lsFindings = checkStore(localStorage, 'localStorage');
        const ssFindings = checkStore(sessionStorage, 'sessionStorage');

        const lsSize = (() => {
          let total = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            total += k.length + (localStorage.getItem(k) || '').length;
          }
          return total;
        })();

        const ssSize = (() => {
          let total = 0;
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i) || '';
            total += k.length + (sessionStorage.getItem(k) || '').length;
          }
          return total;
        })();

        return {
          findings: [...lsFindings, ...ssFindings],
          localStorageCount: localStorage.length,
          sessionStorageCount: sessionStorage.length,
          localStorageSize: lsSize,
          sessionStorageSize: ssSize,
        };
      });

      steps.push(`localStorage: ${storageData.localStorageCount} entries (${storageData.localStorageSize} bytes)`);
      steps.push(`sessionStorage: ${storageData.sessionStorageCount} entries (${storageData.sessionStorageSize} bytes)`);

      if (storageData.findings.length > 0) {
        for (const finding of storageData.findings) {
          steps.push(`Sensitive data in ${finding.store}: key="${finding.key}" — ${finding.reason}`);
        }
      }

      for (const indicator of attack.successIndicators) {
        const indicatorLower = indicator.toLowerCase();

        for (const finding of storageData.findings) {
          if (
            finding.key.toLowerCase().includes(indicatorLower) ||
            finding.value.toLowerCase().includes(indicatorLower) ||
            finding.reason.toLowerCase().includes(indicatorLower)
          ) {
            success = true;
            evidence = `Sensitive data found in ${finding.store}: key="${finding.key}" (${finding.reason}), value preview: "${finding.value}"`;
            screenshot = await this.takeScreenshot(page, attack.id, 'storage-vuln');
            steps.push(`VULNERABILITY CONFIRMED: ${evidence}`);
            break;
          }
        }
        if (success) break;

        if (indicatorLower === 'sensitive_data_in_storage' && storageData.findings.length > 0) {
          success = true;
          const summaries = storageData.findings.slice(0, 5).map(
            (f) => `${f.store}["${f.key}"] — ${f.reason}`,
          );
          evidence = `${storageData.findings.length} sensitive storage entries found: ${summaries.join('; ')}`;
          screenshot = await this.takeScreenshot(page, attack.id, 'storage-sensitive');
          steps.push(`VULNERABILITY CONFIRMED: ${evidence}`);
          break;
        }

        if (indicatorLower === 'unencrypted_token' || indicatorLower === 'plaintext_token') {
          const tokenFindings = storageData.findings.filter(
            (f) => /token|jwt|bearer|oauth|session/i.test(f.key) || /^eyJ/.test(f.value),
          );
          if (tokenFindings.length > 0) {
            success = true;
            evidence = `Unencrypted auth token in browser storage: ${tokenFindings[0].store}["${tokenFindings[0].key}"] = "${tokenFindings[0].value}"`;
            screenshot = await this.takeScreenshot(page, attack.id, 'storage-token');
            steps.push(`VULNERABILITY CONFIRMED: ${evidence}`);
            break;
          }
        }

        if (indicatorLower === 'excessive_storage') {
          const totalSize = storageData.localStorageSize + storageData.sessionStorageSize;
          if (totalSize > 100_000) {
            success = true;
            evidence = `Excessive browser storage usage: ${(totalSize / 1024).toFixed(1)} KB total (localStorage: ${(storageData.localStorageSize / 1024).toFixed(1)} KB, sessionStorage: ${(storageData.sessionStorageSize / 1024).toFixed(1)} KB)`;
            screenshot = await this.takeScreenshot(page, attack.id, 'storage-excessive');
            steps.push(`ISSUE FOUND: ${evidence}`);
            break;
          }
        }
      }

      if (!success && storageData.findings.length > 0) {
        success = true;
        const summaries = storageData.findings.slice(0, 5).map(
          (f) => `${f.store}["${f.key}"] — ${f.reason}`,
        );
        evidence = `Sensitive data detected in browser storage: ${summaries.join('; ')}`;
        screenshot = await this.takeScreenshot(page, attack.id, 'storage-auto');
        steps.push(`VULNERABILITY CONFIRMED: ${evidence}`);
      }
    } finally {
      await page.close();
    }

    return {
      attack,
      pageUrl,
      success,
      evidence: evidence || 'No sensitive data detected in browser storage',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeSsrfOrRedirectCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      for (const payload of attack.payloads.slice(0, 5)) {
        const testUrl = attack.target.url || pageUrl;
        const fullUrl = testUrl.includes('?')
          ? testUrl.replace(/([?&]url=)[^&]*/, `$1${encodeURIComponent(payload)}`)
          : `${testUrl}${testUrl.includes('?') ? '&' : '?'}url=${encodeURIComponent(payload)}`;

        steps.push(`Request: ${fullUrl}`);

        try {
          const response = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
          const status = response?.status() || 0;
          const finalUrl = page.url();
          const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '');

          if (attack.category === 'redirect') {
            const payloadDomain = (() => { try { return new URL(payload).hostname; } catch { return payload; } })();
            if (finalUrl.includes(payloadDomain) && payloadDomain !== new URL(pageUrl).hostname) {
              success = true;
              evidence = `Open redirect: navigated to ${finalUrl} via payload ${payload}`;
              screenshot = await this.takeScreenshot(page, attack.id, 'redirect');
              steps.push(`VULNERABILITY CONFIRMED: Redirected to external domain`);
              break;
            }
          }

          if (attack.category === 'ssrf') {
            for (const indicator of attack.successIndicators) {
              if (bodyText.toLowerCase().includes(indicator.toLowerCase())) {
                success = true;
                evidence = `SSRF: server fetched ${payload} — found "${indicator}" in response`;
                screenshot = await this.takeScreenshot(page, attack.id, 'ssrf');
                steps.push(`VULNERABILITY CONFIRMED: Server-side request succeeded`);
                break;
              }
            }
            if (!success && status === 200 && bodyText.length > 50) {
              const ssrfSignals = [/localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/, /internal/i, /<!doctype/i, /<html/i, /\{.*".*":.*\}/];
              for (const sig of ssrfSignals) {
                if (sig.test(bodyText) && payload.includes('localhost') || payload.includes('127.0.0.1')) {
                  success = true;
                  evidence = `SSRF: server appears to have fetched internal URL ${payload} — response contains "${sig.source}". Preview: ${bodyText.substring(0, 200)}`;
                  screenshot = await this.takeScreenshot(page, attack.id, 'ssrf');
                  steps.push(`VULNERABILITY CONFIRMED: Internal content returned via SSRF`);
                  break;
                }
              }
            }
            if (success) break;
          }
        } catch { /* timeout or nav error */ }
      }
    } finally {
      await page.close();
    }

    return {
      attack, pageUrl, success,
      evidence: evidence || `${attack.category === 'ssrf' ? 'SSRF' : 'Open redirect'} not confirmed`,
      screenshot, duration: Date.now() - start, reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeApiCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      for (const payload of attack.payloads.slice(0, 5)) {
        const testUrl = payload.startsWith('http') ? payload : (attack.target.url || pageUrl);
        steps.push(`Request: ${testUrl}`);

        try {
          const response = await page.goto(testUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
          const status = response?.status() || 0;
          const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 5000) || '');
          const bodyLower = bodyText.toLowerCase();

          for (const indicator of attack.successIndicators) {
            if (bodyLower.includes(indicator.toLowerCase())) {
              success = true;
              evidence = `${attack.category.toUpperCase()}: "${indicator}" found at ${testUrl} (status ${status})`;
              screenshot = await this.takeScreenshot(page, attack.id, attack.category);
              steps.push(`VULNERABILITY CONFIRMED: "${indicator}" detected`);
              break;
            }
          }
          if (success) break;

          if (status === 200 && bodyText.length > 50) {
            const sensitivePatterns = [
              /password/i, /api[_-]?key/i, /secret/i, /token/i, /credential/i,
              /private/i, /ssn/i, /credit.?card/i, /email.*@/i,
            ];

            if (attack.category === 'idor') {
              let isJson = false;
              try { JSON.parse(bodyText); isJson = true; } catch { /* not json */ }
              const hasUserData = /("id"|"user"|"name"|"email"|"password"|"role"|"order"|"address")/i.test(bodyText);
              if (isJson && hasUserData) {
                success = true;
                evidence = `IDOR: API endpoint ${testUrl} returned user/sensitive data without authorization (status ${status}). Preview: ${bodyText.substring(0, 200)}`;
                screenshot = await this.takeScreenshot(page, attack.id, 'idor');
                steps.push(`VULNERABILITY CONFIRMED: Sensitive data accessible via direct object reference`);
                break;
              }
              if (hasUserData) {
                for (const pattern of sensitivePatterns) {
                  if (pattern.test(bodyText)) {
                    success = true;
                    evidence = `IDOR: Sensitive pattern "${pattern.source}" found at ${testUrl} (status ${status})`;
                    screenshot = await this.takeScreenshot(page, attack.id, 'idor');
                    steps.push(`VULNERABILITY CONFIRMED: Sensitive data exposed via IDOR`);
                    break;
                  }
                }
                if (success) break;
              }
            }

            if (attack.category === 'info-leak') {
              for (const pattern of sensitivePatterns) {
                if (pattern.test(bodyText)) {
                  success = true;
                  evidence = `Information leak: sensitive data pattern "${pattern.source}" found at ${testUrl} (status ${status}). Preview: ${bodyText.substring(0, 200)}`;
                  screenshot = await this.takeScreenshot(page, attack.id, 'info-leak');
                  steps.push(`VULNERABILITY CONFIRMED: Sensitive data exposed`);
                  break;
                }
              }
              if (success) break;

              const debugPatterns = [/node_modules/i, /stack.*trace/i, /env/i, /debug/i, /config/i, /version.*node/i, /process\.env/i];
              for (const pattern of debugPatterns) {
                if (pattern.test(bodyText)) {
                  success = true;
                  evidence = `Information leak: debug/config data "${pattern.source}" found at ${testUrl}`;
                  screenshot = await this.takeScreenshot(page, attack.id, 'info-leak-debug');
                  steps.push(`VULNERABILITY CONFIRMED: Debug/config information exposed`);
                  break;
                }
              }
              if (success) break;
            }
          }
        } catch { /* timeout */ }
      }
    } finally {
      await page.close();
    }

    return {
      attack, pageUrl, success,
      evidence: evidence || 'No issues detected',
      screenshot, duration: Date.now() - start, reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeAccessibilityCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      const targetUrl = attack.target.url || pageUrl;
      steps.push(`Navigate to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
      await page.waitForTimeout(1000);

      const a11yResults = await page.evaluate(() => {
        const issues: Array<{ type: string; element: string; detail: string }> = [];

        document.querySelectorAll('img').forEach((img) => {
          if (!img.alt && !img.getAttribute('role')) {
            issues.push({ type: 'missing-alt', element: img.outerHTML.substring(0, 120), detail: 'Image missing alt text' });
          }
        });

        document.querySelectorAll('input, textarea, select').forEach((el) => {
          const input = el as HTMLInputElement;
          const id = input.id;
          const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
          const hasAriaLabel = !!input.getAttribute('aria-label') || !!input.getAttribute('aria-labelledby');
          const hasTitle = !!input.title;
          if (!hasLabel && !hasAriaLabel && !hasTitle && input.type !== 'hidden' && input.type !== 'submit') {
            issues.push({ type: 'missing-label', element: `<${el.tagName.toLowerCase()} name="${input.name}" type="${input.type}">`, detail: 'Form input missing associated label or aria-label' });
          }
        });

        document.querySelectorAll('button, [role="button"]').forEach((btn) => {
          const text = btn.textContent?.trim();
          const ariaLabel = btn.getAttribute('aria-label');
          if (!text && !ariaLabel) {
            issues.push({ type: 'empty-button', element: btn.outerHTML.substring(0, 120), detail: 'Button has no accessible name' });
          }
        });

        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        let prevLevel = 0;
        for (const h of headings) {
          const level = parseInt(h.tagName[1]);
          if (prevLevel > 0 && level > prevLevel + 1) {
            issues.push({ type: 'heading-skip', element: `<${h.tagName.toLowerCase()}>`, detail: `Heading level skipped from h${prevLevel} to h${level}` });
          }
          prevLevel = level;
        }

        const hasH1 = headings.some((h) => h.tagName === 'H1');
        if (!hasH1 && headings.length > 0) {
          issues.push({ type: 'no-h1', element: 'document', detail: 'Page has headings but no h1 element' });
        }

        const hasSkipLink = !!document.querySelector('a[href="#main"], a[href="#content"], .skip-link, .skip-to-content');
        if (!hasSkipLink) {
          issues.push({ type: 'no-skip-link', element: 'document', detail: 'No skip-to-content navigation link found' });
        }

        document.querySelectorAll('a[href]').forEach((a) => {
          const text = a.textContent?.trim();
          const ariaLabel = a.getAttribute('aria-label');
          if (!text && !ariaLabel) {
            const img = a.querySelector('img');
            if (!img || !img.alt) {
              issues.push({ type: 'empty-link', element: a.outerHTML.substring(0, 120), detail: 'Link has no accessible text' });
            }
          }
        });

        const htmlLang = document.documentElement.lang;
        if (!htmlLang) {
          issues.push({ type: 'no-lang', element: '<html>', detail: 'HTML element missing lang attribute' });
        }

        return issues;
      });

      steps.push(`Found ${a11yResults.length} accessibility issues`);

      for (const indicator of attack.successIndicators) {
        const indicatorLower = indicator.toLowerCase();
        const matching = a11yResults.filter((r) =>
          r.type.toLowerCase().includes(indicatorLower) ||
          r.detail.toLowerCase().includes(indicatorLower),
        );
        if (matching.length > 0) {
          success = true;
          evidence = `Accessibility: ${matching.length} "${indicator}" issues found. ${matching.slice(0, 3).map((m) => m.detail).join('; ')}`;
          screenshot = await this.takeScreenshot(page, attack.id, 'a11y');
          steps.push(`ISSUE FOUND: ${evidence}`);
          break;
        }
      }

      if (!success && a11yResults.length > 0) {
        success = true;
        const summary = a11yResults.slice(0, 5).map((r) => `${r.type}: ${r.detail}`).join('; ');
        evidence = `${a11yResults.length} accessibility violations found: ${summary}`;
        screenshot = await this.takeScreenshot(page, attack.id, 'a11y-auto');
        steps.push(`ISSUE FOUND: ${evidence}`);
      }
    } finally {
      await page.close();
    }

    return {
      attack, pageUrl, success,
      evidence: evidence || 'No accessibility issues detected',
      screenshot, duration: Date.now() - start, reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeUxCheck(attack: Attack, pageUrl: string): Promise<AttackResult> {
    const start = Date.now();
    const steps: string[] = [];
    let evidence = '';
    let success = false;
    let screenshot: string | undefined;

    const page = await this.context.newPage();
    try {
      const targetUrl = attack.target.url || pageUrl;
      steps.push(`Navigate to ${targetUrl}`);

      const navStart = Date.now();
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
      const loadTime = Date.now() - navStart;
      steps.push(`Page load time: ${loadTime}ms`);

      const uxResults = await page.evaluate(() => {
        const issues: Array<{ type: string; detail: string }> = [];

        const brokenImages = document.querySelectorAll('img');
        brokenImages.forEach((img) => {
          if (!img.complete || img.naturalWidth === 0) {
            issues.push({ type: 'broken-image', detail: `Broken image: ${img.src?.substring(0, 100)}` });
          }
        });

        document.querySelectorAll('a[href]').forEach((a) => {
          const href = (a as HTMLAnchorElement).href;
          if (!href || href === '#' || href === 'javascript:void(0)') {
            issues.push({ type: 'dead-link', detail: `Non-functional link: "${a.textContent?.trim()?.substring(0, 50)}"` });
          }
        });

        document.querySelectorAll('form').forEach((form, i) => {
          const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select');
          inputs.forEach((input) => {
            const el = input as HTMLInputElement;
            if (!el.placeholder && !el.getAttribute('aria-label')) {
              const id = el.id;
              const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
              if (!hasLabel) {
                issues.push({ type: 'unlabeled-input', detail: `Form ${i + 1}: input "${el.name || el.type}" has no label or placeholder` });
              }
            }
          });
        });

        const viewport = { w: window.innerWidth, h: window.innerHeight };
        document.querySelectorAll('*').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewport.w + 10 && rect.width > 0) {
            issues.push({ type: 'overflow', detail: `Element overflows viewport: <${el.tagName.toLowerCase()}>` });
          }
        });

        return issues;
      });

      if (loadTime > 5000) {
        uxResults.push({ type: 'slow-load', detail: `Page took ${loadTime}ms to load (> 5s threshold)` });
      }

      steps.push(`Found ${uxResults.length} UX issues`);

      for (const indicator of attack.successIndicators) {
        const indicatorLower = indicator.toLowerCase();
        const matching = uxResults.filter((r) =>
          r.type.toLowerCase().includes(indicatorLower) ||
          r.detail.toLowerCase().includes(indicatorLower),
        );
        if (matching.length > 0) {
          success = true;
          evidence = `UX: ${matching.length} "${indicator}" issues. ${matching.slice(0, 3).map((m) => m.detail).join('; ')}`;
          screenshot = await this.takeScreenshot(page, attack.id, 'ux');
          steps.push(`ISSUE FOUND: ${evidence}`);
          break;
        }
      }

      if (!success && uxResults.length > 0) {
        success = true;
        const summary = uxResults.slice(0, 5).map((r) => `${r.type}: ${r.detail}`).join('; ');
        evidence = `${uxResults.length} UX issues found: ${summary}`;
        screenshot = await this.takeScreenshot(page, attack.id, 'ux-auto');
        steps.push(`ISSUE FOUND: ${evidence}`);
      }
    } finally {
      await page.close();
    }

    return {
      attack, pageUrl, success,
      evidence: evidence || 'No UX issues detected',
      screenshot, duration: Date.now() - start, reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
  }

  private async takeScreenshot(page: Page, attackId: string, context: string): Promise<string> {
    const filename = `vuln-${attackId}-${sanitize(context)}.png`;
    const filepath = path.join(this.config.screenshotDir, filename);
    try {
      await page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch {
      return '';
    }
  }
}

function injectPayloadIntoUrl(url: string, payload: string): string {
  if (payload.startsWith('http://') || payload.startsWith('https://')) {
    return payload;
  }

  const u = new URL(url);

  if (payload.includes('..') || payload.startsWith('/') || payload.startsWith('%')) {
    const segments = u.pathname.replace(/\/$/, '').split('/');
    if (segments.length > 1) {
      segments[segments.length - 1] = payload;
    } else {
      segments.push(payload);
    }
    u.pathname = segments.join('/');
    return u.toString();
  }

  if (u.searchParams.toString()) {
    const firstKey = u.searchParams.keys().next().value;
    if (firstKey) u.searchParams.set(firstKey, payload);
  } else {
    u.searchParams.set('file', payload);
  }
  return u.toString();
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 30);
}
