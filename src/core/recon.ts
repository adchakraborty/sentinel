import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { PageMap, FormInfo, InputInfo, LinkInfo, CookieInfo, StorageInfo, NemesisConfig } from '../types.js';

/**
 * Reconnaissance module — crawls the target app and maps every page,
 * form, input, link, and cookie. This is the "eyes" of NEMESIS.
 */
export class Recon {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: NemesisConfig;
  private visited = new Set<string>();
  private pages: PageMap[] = [];

  constructor(config: NemesisConfig) {
    this.config = config;
    fs.mkdirSync(config.screenshotDir, { recursive: true });
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--ignore-certificate-errors'],
    });

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    };

    if (this.config.auth?.type === 'basic' && this.config.auth.username) {
      contextOptions.httpCredentials = {
        username: this.config.auth.username,
        password: this.config.auth.password || '',
      };
    }

    if (this.config.auth?.type === 'bearer' && this.config.auth.token) {
      contextOptions.extraHTTPHeaders = {
        Authorization: `Bearer ${this.config.auth.token}`,
      };
    }

    this.context = await this.browser.newContext(contextOptions);

    if (this.config.auth?.type === 'cookie' && this.config.auth.cookies) {
      const origin = new URL(this.config.targetUrl).origin;
      const domain = new URL(this.config.targetUrl).hostname;
      const cookieEntries = Object.entries(this.config.auth.cookies).map(([name, value]) => ({
        name, value, domain, path: '/', url: origin,
      }));
      await this.context.addCookies(cookieEntries);
    }

    if (this.config.auth?.type === 'form-login' && this.config.auth.loginUrl) {
      await this.performFormLogin();
    }

    if (this.config.auth?.type === 'idp-login') {
      await this.performIdpLogin();
    }
  }

  private async performFormLogin(): Promise<void> {
    if (!this.context || !this.config.auth) return;
    const { loginUrl, username, password, usernameField, passwordField } = this.config.auth;
    if (!loginUrl || !username) return;

    const page = await this.context.newPage();
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });

      const userSelector = usernameField || 'input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]';
      const passSelector = passwordField || 'input[type="password"]';

      await page.locator(userSelector).first().fill(username, { timeout: 5000 });
      await page.locator(passSelector).first().fill(password || '', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      console.error(`[recon] Authenticated as ${username} via form login at ${loginUrl}`);
    } catch (e) {
      console.error(`[recon] Form login failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      await page.close();
    }
  }

  private async performIdpLogin(): Promise<void> {
    if (!this.context || !this.config.auth) return;
    const {
      loginUrl, username, password, usernameField, passwordField,
      loginTrigger, consentButton, postLoginUrlPattern,
    } = this.config.auth;

    const startUrl = loginUrl || this.config.targetUrl;
    if (!username) return;

    const page = await this.context.newPage();
    try {
      // Step 1: Navigate to the app's login page
      console.error(`[recon] IDP login: navigating to ${startUrl}`);
      await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Step 2: Click the login trigger button (e.g. "Login" button on the app)
      if (loginTrigger) {
        console.error(`[recon] IDP login: clicking login trigger "${loginTrigger}"`);
        try {
          await page.locator(loginTrigger).first().click({ timeout: 10000 });
        } catch {
          // Try finding by text content as fallback
          console.error(`[recon] IDP login: selector failed, trying text-based click`);
          await page.getByRole('button', { name: /login|sign.?in|log.?in/i }).first().click({ timeout: 10000 });
        }
      } else {
        // Auto-detect: look for a login/sign-in button
        console.error(`[recon] IDP login: auto-detecting login button`);
        await page.getByRole('button', { name: /login|sign.?in|log.?in/i }).first().click({ timeout: 10000 });
      }

      // Step 3: Wait for IDP redirect — the URL should change to the IDP domain
      console.error(`[recon] IDP login: waiting for IDP redirect...`);
      await page.waitForURL((url) => {
        const currentOrigin = new URL(startUrl).origin;
        return url.origin !== currentOrigin || url.pathname.includes('authentication');
      }, { timeout: 30000 }).catch(() => {
        console.error(`[recon] IDP login: URL did not change, IDP may be on same domain or already redirected`);
      });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);

      console.error(`[recon] IDP login: now at ${page.url()}`);

      // Step 4: Fill in credentials on the IDP page
      const userSelector = usernameField || 'input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"], input[id*="user"], input[id*="login"]';
      const passSelector = passwordField || 'input[type="password"]';

      try {
        await page.locator(userSelector).first().waitFor({ state: 'visible', timeout: 15000 });
        await page.locator(userSelector).first().fill(username, { timeout: 5000 });
        console.error(`[recon] IDP login: filled username`);
      } catch (e) {
        console.error(`[recon] IDP login: could not fill username: ${e instanceof Error ? e.message : e}`);
      }

      try {
        await page.locator(passSelector).first().fill(password || '', { timeout: 5000 });
        console.error(`[recon] IDP login: filled password`);
      } catch (e) {
        console.error(`[recon] IDP login: could not fill password: ${e instanceof Error ? e.message : e}`);
      }

      // Submit the IDP form
      await page.keyboard.press('Enter');
      console.error(`[recon] IDP login: submitted credentials`);
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      console.error(`[recon] IDP login: after credential submit, now at ${page.url()}`);

      // Step 5: Handle consent page if present
      await this.handleConsentPage(page, consentButton);

      // Step 6: Wait for redirect back to the app
      const targetPattern = postLoginUrlPattern || '/home';
      console.error(`[recon] IDP login: waiting for post-login URL containing "${targetPattern}"...`);

      try {
        await page.waitForURL((url) => url.href.includes(targetPattern), { timeout: 30000 });
      } catch {
        console.error(`[recon] IDP login: did not reach expected URL pattern "${targetPattern}", current URL: ${page.url()}`);
        // Check if we're on a consent page we missed
        await this.handleConsentPage(page, consentButton);
        await page.waitForTimeout(5000);
      }

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.error(`[recon] IDP login: completed, final URL: ${page.url()}`);

    } catch (e) {
      console.error(`[recon] IDP login failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      await page.close();
    }
  }

  private async handleConsentPage(page: import('playwright').Page, consentButton?: string): Promise<void> {
    try {
      // Check for consent/authorization page
      const pageText = await page.textContent('body', { timeout: 3000 }).catch(() => '') || '';
      const isConsentPage = /consent|authorize|permission|allow|approve|grant/i.test(pageText);

      if (!isConsentPage) return;

      console.error(`[recon] IDP login: consent page detected`);

      if (consentButton) {
        // Use provided selector
        try {
          await page.locator(consentButton).first().click({ timeout: 10000 });
          console.error(`[recon] IDP login: clicked consent button via selector`);
          await page.waitForTimeout(3000);
          return;
        } catch {
          console.error(`[recon] IDP login: consent selector failed, trying auto-detect`);
        }
      }

      // Auto-detect consent button by common patterns
      const consentSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Allow")',
        'button:has-text("Approve")',
        'button:has-text("Grant")',
        'button:has-text("Consent")',
        'button:has-text("Yes")',
        'button:has-text("Continue")',
        'input[type="submit"][value*="Accept" i]',
        'input[type="submit"][value*="Allow" i]',
        'input[type="submit"][value*="Approve" i]',
        'input[type="submit"][value*="Yes" i]',
        'button[type="submit"]',
      ];

      for (const selector of consentSelectors) {
        try {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click({ timeout: 5000 });
            console.error(`[recon] IDP login: clicked consent button via "${selector}"`);
            await page.waitForTimeout(3000);
            return;
          }
        } catch {
          // Try next selector
        }
      }

      console.error(`[recon] IDP login: could not find consent button, proceeding anyway`);
    } catch {
      // Not a consent page or couldn't interact — continue
    }
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('Browser not launched. Call launch() first.');
    return this.context;
  }

  async crawl(): Promise<PageMap[]> {
    if (!this.context) throw new Error('Browser not launched');

    const queue = [this.config.targetUrl];

    while (queue.length > 0 && this.visited.size < this.config.maxPages) {
      const url = queue.shift()!;
      const normalized = normalizeUrl(url);

      if (this.visited.has(normalized)) continue;
      this.visited.add(normalized);

      try {
        const pageMap = await this.scanPage(url);
        this.pages.push(pageMap);

        for (const link of pageMap.links) {
          if (link.isInternal && !this.visited.has(normalizeUrl(link.href))) {
            queue.push(link.href);
          }
        }
      } catch (e) {
        console.error(`[recon] Failed to scan ${url}: ${e instanceof Error ? e.message : e}`);
      }
    }

    return this.pages;
  }

  private async scanPage(url: string): Promise<PageMap> {
    const page = await this.context!.newPage();
    page.setDefaultTimeout(this.config.timeout);

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: this.config.timeout });
      const headers: Record<string, string> = {};
      if (response) {
        const allHeaders = await response.allHeaders();
        for (const [k, v] of Object.entries(allHeaders)) {
          headers[k.toLowerCase()] = v;
        }
      }

      await page.waitForTimeout(500);

      const title = await page.title();
      const forms = await this.extractForms(page);
      const inputs = await this.extractStandaloneInputs(page);
      const links = await this.extractLinks(page, url);
      const cookies = await this.extractCookies();
      const storage = await this.extractStorage(page);
      const htmlSnippet = await page.evaluate(() => document.body?.innerHTML?.substring(0, 5000) || '');

      const screenshotName = `recon-${sanitizeFilename(url)}.png`;
      const screenshotPath = path.join(this.config.screenshotDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      return {
        url: page.url(),
        title,
        forms,
        inputs,
        links,
        cookies,
        storage,
        headers,
        screenshot: screenshotPath,
        htmlSnippet,
      };
    } finally {
      await page.close();
    }
  }

  private async extractForms(page: Page): Promise<FormInfo[]> {
    return page.evaluate(() => {
      const forms: any[] = [];
      document.querySelectorAll('form').forEach((form, fi) => {
        const inputs: any[] = [];
        form.querySelectorAll('input, textarea, select').forEach((el, ii) => {
          const input = el as HTMLInputElement;
          const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || '';
          inputs.push({
            name: input.name || input.id || `input-${ii}`,
            type: input.type || 'text',
            selector: input.id ? `#${input.id}` : `form:nth-of-type(${fi + 1}) ${el.tagName.toLowerCase()}:nth-of-type(${ii + 1})`,
            placeholder: input.placeholder || undefined,
            label: label || undefined,
            required: input.required,
          });
        });
        forms.push({
          action: form.action || '',
          method: (form.method || 'GET').toUpperCase(),
          inputs,
          selector: form.id ? `#${form.id}` : `form:nth-of-type(${fi + 1})`,
        });
      });
      return forms;
    });
  }

  private async extractStandaloneInputs(page: Page): Promise<InputInfo[]> {
    return page.evaluate(() => {
      const inputs: any[] = [];
      document.querySelectorAll('input:not(form input), textarea:not(form textarea)').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || '';
        inputs.push({
          name: input.name || input.id || `standalone-${i}`,
          type: input.type || 'text',
          selector: input.id ? `#${input.id}` : `body > input:nth-of-type(${i + 1})`,
          placeholder: input.placeholder || undefined,
          label: label || undefined,
          required: input.required,
        });
      });
      return inputs;
    });
  }

  private async extractLinks(page: Page, currentUrl: string): Promise<LinkInfo[]> {
    const baseOrigin = new URL(currentUrl).origin;
    return page.evaluate((origin) => {
      const links: any[] = [];
      const seen = new Set<string>();
      document.querySelectorAll('a[href]').forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || seen.has(href)) return;
        seen.add(href);
        links.push({
          href,
          text: a.textContent?.trim().substring(0, 100) || '',
          isInternal: href.startsWith(origin),
        });
      });
      return links;
    }, baseOrigin);
  }

  private async extractCookies(): Promise<CookieInfo[]> {
    const cookies = await this.context!.cookies();
    return cookies.map((c) => ({
      name: c.name,
      value: c.value.substring(0, 50),
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));
  }

  private async extractStorage(page: Page): Promise<StorageInfo> {
    try {
      const webStorage = await page.evaluate(() => {
        const readStore = (store: Storage) => {
          const entries: Array<{ key: string; value: string; size: number }> = [];
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key) continue;
            const value = store.getItem(key) || '';
            entries.push({
              key,
              value: value.substring(0, 200),
              size: value.length,
            });
          }
          return entries;
        };

        return {
          localStorage: readStore(localStorage),
          sessionStorage: readStore(sessionStorage),
        };
      });

      let indexedDBDatabases: string[] = [];
      try {
        indexedDBDatabases = await page.evaluate(async () => {
          if (typeof indexedDB === 'undefined' || !indexedDB.databases) return [];
          const dbs = await indexedDB.databases();
          return dbs.map((db) => db.name || '(unnamed)');
        });
      } catch { /* indexedDB.databases() may not be supported */ }

      return {
        localStorage: webStorage.localStorage,
        sessionStorage: webStorage.sessionStorage,
        indexedDBDatabases,
      };
    } catch {
      return { localStorage: [], sessionStorage: [], indexedDBDatabases: [] };
    }
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function sanitizeFilename(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 60);
}
