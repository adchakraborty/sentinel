import type { AttackPlan, Attack, PageMap } from '../../src/types';

/**
 * Generate deterministic baseline attacks from recon data.
 * These always run regardless of LLM output, ensuring consistent coverage.
 */
export function generateBaselineAttacks(
  pages: PageMap[],
  targetUrl: string,
  exampleData?: Record<string, string>,
): AttackPlan[] {
  const plans: AttackPlan[] = [];
  const baseUrl = targetUrl.replace(/\/$/, '');

  const homePage = pages[0];
  if (!homePage) return plans;

  const homeAttacks: Attack[] = [];

  // --- Injection + XSS on every text input ---
  for (const page of pages) {
    const pageAttacks: Attack[] = [];
    const textInputs = page.inputs.filter(
      (i) => ['text', 'search', 'email', 'url', 'tel', 'textarea'].includes(i.type),
    );

    for (const input of textInputs) {
      pageAttacks.push({
        id: `baseline-sqli-${input.name || input.selector}`,
        category: 'injection',
        name: `SQL Injection on ${input.name || input.type} input`,
        description: `Baseline SQLi test on ${input.selector}`,
        target: { type: 'form', selector: input.selector, inputName: input.name },
        payloads: ["' OR 1=1 --", "' UNION SELECT null,null,null--", "1' AND '1'='1", "'; DROP TABLE users--"],
        successIndicators: ['sql', 'error', 'syntax', 'sqlite', 'mysql', 'query'],
        severity: 'critical',
      });

      pageAttacks.push({
        id: `baseline-xss-${input.name || input.selector}`,
        category: 'xss',
        name: `Reflected XSS on ${input.name || input.type} input`,
        description: `Baseline XSS test on ${input.selector}`,
        target: { type: 'form', selector: input.selector, inputName: input.name },
        payloads: ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>'],
        successIndicators: ['alert', 'script', 'onerror'],
        severity: 'high',
      });
    }

    if (pageAttacks.length > 0) {
      plans.push({ pageUrl: page.url, attacks: pageAttacks });
    }
  }

  // --- CORS check on target ---
  homeAttacks.push({
    id: 'baseline-cors',
    category: 'cors',
    name: 'CORS misconfiguration check',
    description: 'Test if server reflects arbitrary origins or uses wildcard CORS',
    target: { type: 'header', url: baseUrl },
    payloads: ['Origin: https://evil.com', 'Origin: https://attacker.example.com', 'Origin: null'],
    successIndicators: ['access-control-allow-origin'],
    severity: 'high',
  });

  // --- Accessibility on homepage ---
  homeAttacks.push({
    id: 'baseline-a11y',
    category: 'accessibility',
    name: 'Accessibility audit',
    description: 'Check for WCAG violations: alt text, labels, headings, skip links, lang',
    target: { type: 'direct-url', url: homePage.url },
    payloads: [],
    successIndicators: ['missing-alt', 'missing-label', 'no-skip-link', 'no-lang'],
    severity: 'low',
  });

  // --- UX check on homepage ---
  homeAttacks.push({
    id: 'baseline-ux',
    category: 'ux',
    name: 'UX and usability check',
    description: 'Check for broken images, dead links, slow loads',
    target: { type: 'direct-url', url: homePage.url },
    payloads: [],
    successIndicators: ['broken-image', 'dead-link', 'slow-load', 'unlabeled-input'],
    severity: 'low',
  });

  // --- Storage check on homepage ---
  homeAttacks.push({
    id: 'baseline-storage',
    category: 'storage',
    name: 'Browser storage exposure check',
    description: 'Check for sensitive data in localStorage/sessionStorage',
    target: { type: 'storage', url: homePage.url },
    payloads: [],
    successIndicators: ['sensitive_data_in_storage', 'token', 'password', 'api_key'],
    severity: 'medium',
  });

  // --- CSRF check on forms ---
  for (const page of pages) {
    for (const form of page.forms) {
      if (form.method.toLowerCase() === 'post') {
        homeAttacks.push({
          id: `baseline-csrf-${form.action}`,
          category: 'csrf',
          name: `CSRF check on ${form.action}`,
          description: `Test if POST to ${form.action} is accepted without CSRF token`,
          target: { type: 'direct-url', url: form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}` },
          payloads: [],
          successIndicators: [],
          severity: 'high',
        });
        break;
      }
    }
  }

  // --- API-based attacks from links ---
  const apiLinks = new Set<string>();
  for (const page of pages) {
    for (const link of page.links) {
      if (link.href.includes('/api/') || link.href.includes('/api?')) {
        apiLinks.add(link.href.startsWith('http') ? link.href : `${baseUrl}${link.href}`);
      }
    }
  }

  // Common API endpoints to probe
  const commonApiPaths = [
    '/api/users', '/api/users/1', '/api/users/2',
    '/api/orders', '/api/orders/1',
    '/api/debug', '/api/config', '/api/env',
    '/api/admin', '/api/status',
  ];

  for (const apiPath of commonApiPaths) {
    apiLinks.add(`${baseUrl}${apiPath}`);
  }

  const idorPayloads = Array.from(apiLinks).filter((u) => /\/(users|orders|products|items|accounts)/.test(u));
  if (idorPayloads.length > 0) {
    homeAttacks.push({
      id: 'baseline-idor',
      category: 'idor',
      name: 'IDOR on API endpoints',
      description: 'Test if API endpoints expose data without authorization',
      target: { type: 'direct-url' },
      payloads: idorPayloads.slice(0, 6),
      successIndicators: ['password', 'email', 'username', 'token', 'secret', 'api_key', 'address'],
      severity: 'high',
    });
  }

  const infoLeakPayloads = Array.from(apiLinks).filter((u) => /(debug|config|env|status|admin|info)/.test(u));
  if (infoLeakPayloads.length === 0) {
    infoLeakPayloads.push(`${baseUrl}/api/debug`, `${baseUrl}/api/config`, `${baseUrl}/api/env`);
  }
  homeAttacks.push({
    id: 'baseline-info-leak',
    category: 'info-leak',
    name: 'Information disclosure on debug/config endpoints',
    description: 'Probe common debug and config endpoints for information leaks',
    target: { type: 'direct-url' },
    payloads: infoLeakPayloads.slice(0, 6),
    successIndicators: ['password', 'secret', 'token', 'debug', 'config', 'node_modules', 'env'],
    severity: 'high',
  });

  // --- SSRF if /api/preview or similar exists ---
  const ssrfEndpoints = Array.from(apiLinks).filter((u) => /(preview|proxy|fetch|url|redirect|callback|forward)/.test(u));
  if (ssrfEndpoints.length > 0) {
    const ssrfPayloads = ssrfEndpoints.map((ep) => {
      const u = new URL(ep);
      u.searchParams.set('url', `http://localhost:${new URL(baseUrl).port || '3001'}/api/debug`);
      return u.toString();
    });
    homeAttacks.push({
      id: 'baseline-ssrf',
      category: 'ssrf',
      name: 'SSRF via URL parameter endpoints',
      description: 'Test if server-side endpoints fetch arbitrary URLs',
      target: { type: 'direct-url' },
      payloads: ssrfPayloads.slice(0, 4),
      successIndicators: ['debug', 'localhost', 'internal', 'env', 'config'],
      severity: 'critical',
    });
  } else {
    homeAttacks.push({
      id: 'baseline-ssrf',
      category: 'ssrf',
      name: 'SSRF via common preview endpoint',
      description: 'Test common SSRF-prone endpoints',
      target: { type: 'direct-url' },
      payloads: [
        `${baseUrl}/api/preview?url=http://localhost:${new URL(baseUrl).port || '3001'}/api/debug`,
        `${baseUrl}/api/fetch?url=http://localhost:${new URL(baseUrl).port || '3001'}/api/debug`,
        `${baseUrl}/api/proxy?url=http://localhost:${new URL(baseUrl).port || '3001'}/api/debug`,
      ],
      successIndicators: ['debug', 'localhost', 'internal', 'env', 'config'],
      severity: 'critical',
    });
  }

  // --- Path traversal ---
  homeAttacks.push({
    id: 'baseline-traversal',
    category: 'traversal',
    name: 'Directory traversal via file endpoints',
    description: 'Test for path traversal vulnerabilities',
    target: { type: 'url-param', url: `${baseUrl}/file` },
    payloads: ['../../package.json', '../../../etc/passwd', '..\\..\\package.json', '....//....//package.json'],
    successIndicators: ['dependencies', 'scripts', 'root:', 'version', 'name'],
    severity: 'critical',
  });

  // --- Auth bypass ---
  const protectedPaths = ['/admin', '/dashboard', '/settings', '/profile', '/api/admin'];
  homeAttacks.push({
    id: 'baseline-auth-bypass',
    category: 'auth',
    name: 'Authentication bypass on protected routes',
    description: 'Access protected pages without authentication',
    target: { type: 'direct-url' },
    payloads: protectedPaths.map((p) => `${baseUrl}${p}`),
    successIndicators: ['admin', 'dashboard', 'settings', 'user', 'welcome'],
    severity: 'critical',
  });

  if (homeAttacks.length > 0) {
    plans.push({ pageUrl: homePage.url, attacks: homeAttacks });
  }

  return plans;
}
