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

          if (attack.category === 'xss') {
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

    const page = await this.context.newPage();
    try {
      const freshContext = await this.context.browser()!.newContext({
        ignoreHTTPSErrors: true,
      });
      const cleanPage = await freshContext.newPage();

      try {
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
      } finally {
        await freshContext.close();
      }
    } finally {
      await page.close();
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
        steps.push(`Send state-changing request to ${targetUrl} without CSRF token`);

        const response = await page.request.fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const status = response.status();
        steps.push(`Response status: ${status}`);

        if (status === 403 || status === 401) {
          evidence = `CSRF protection is active — server returned ${status} when CSRF token was omitted`;
          steps.push(`CSRF protection verified: ${status} response`);
        } else if (status >= 200 && status < 300) {
          const csrfHeaders = Object.keys(response.headers()).filter((h) =>
            h.toLowerCase().includes('csrf') || h.toLowerCase().includes('xsrf'),
          );

          if (csrfHeaders.length > 0) {
            steps.push(`CSRF-related headers found: ${csrfHeaders.join(', ')}`);

            const deleteResponse = await page.request.fetch(targetUrl, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
            });
            const deleteStatus = deleteResponse.status();
            steps.push(`State-changing DELETE without CSRF token returned: ${deleteStatus}`);

            if (deleteStatus === 403 || deleteStatus === 401) {
              evidence = `CSRF protection is active — GET returned ${status} but DELETE without token returned ${deleteStatus}`;
              steps.push(`CSRF protection verified on state-changing methods`);
            } else if (deleteStatus >= 200 && deleteStatus < 300) {
              success = true;
              evidence = `Possible CSRF vulnerability — DELETE without CSRF token returned ${deleteStatus}`;
              steps.push(`VULNERABILITY CONFIRMED: State-changing request accepted without CSRF token`);
            } else {
              evidence = `CSRF check inconclusive — DELETE returned ${deleteStatus}`;
            }
          } else {
            const postResponse = await page.request.fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              data: '{}',
            });
            const postStatus = postResponse.status();
            steps.push(`POST without CSRF token returned: ${postStatus}`);

            if (postStatus === 403 || postStatus === 401) {
              evidence = `CSRF protection is active — POST without token returned ${postStatus}`;
              steps.push(`CSRF protection verified`);
            } else if (postStatus >= 200 && postStatus < 300) {
              success = true;
              evidence = `Possible CSRF vulnerability — POST without CSRF token returned ${postStatus}`;
              steps.push(`VULNERABILITY CONFIRMED: State-changing request accepted without CSRF token`);
            } else {
              evidence = `CSRF check inconclusive — POST returned ${postStatus}`;
            }
          }
        } else {
          evidence = `CSRF check inconclusive — server returned ${status}`;
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
  const u = new URL(url);
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
