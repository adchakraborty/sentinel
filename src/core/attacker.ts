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
        steps.push(`Access ${pageUrl} without any authentication`);
        const response = await cleanPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
        const status = response?.status() || 0;
        const bodyText = await cleanPage.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
        const finalUrl = cleanPage.url();

        const wasRedirectedToLogin = finalUrl.toLowerCase().includes('login') || finalUrl.toLowerCase().includes('auth');
        const gotForbidden = status === 401 || status === 403;

        if (!wasRedirectedToLogin && !gotForbidden && status === 200) {
          const hasContent = attack.successIndicators.some((ind) =>
            bodyText.toLowerCase().includes(ind.toLowerCase()),
          );
          if (hasContent) {
            success = true;
            evidence = `Sensitive page accessible without authentication (status ${status}). Content indicators found.`;
            screenshot = await this.takeScreenshot(cleanPage, attack.id, 'no-auth');
            steps.push(`VULNERABILITY CONFIRMED: Page returned ${status} with sensitive content`);
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
      evidence: evidence || 'Authentication appears to be enforced',
      screenshot,
      duration: Date.now() - start,
      reproductionSteps: steps,
      timestamp: new Date().toISOString(),
    };
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
    return {
      attack,
      pageUrl,
      success: true,
      evidence: 'Wildcard CORS header (Access-Control-Allow-Origin: *) detected during recon',
      duration: 0,
      reproductionSteps: [
        `curl -I -H "Origin: https://evil.com" ${pageUrl}`,
        'Check Access-Control-Allow-Origin header in response',
      ],
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
    return {
      attack,
      pageUrl,
      success: true,
      evidence: attack.description,
      duration: 0,
      reproductionSteps: [
        `Navigate to ${pageUrl}`,
        'Inspect form — no CSRF token field present',
        'Submit form from cross-origin page to confirm CSRF vulnerability',
      ],
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
