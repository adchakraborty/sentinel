import { NemesisReport, AttackResult } from '../types.js';

/**
 * Generate SARIF 2.1.0 output for CI integration (GitHub Security tab, etc.)
 */
export function generateSarifReport(report: NemesisReport): string {
  const rules = buildRules(report.results.filter((r) => r.success));
  const results = report.results
    .filter((r) => r.success)
    .map((r) => toSarifResult(r));

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'SENTINEL',
            version: '3.0.0',
            informationUri: 'https://github.com/sentinel-ai/sentinel',
            semanticVersion: '3.0.0',
            rules,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: report.startedAt,
            endTimeUtc: report.completedAt,
          },
        ],
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function buildRules(vulns: AttackResult[]) {
  const seen = new Set<string>();
  const rules: object[] = [];

  for (const v of vulns) {
    const ruleId = `SENTINEL/${v.attack.category}`;
    if (seen.has(ruleId)) continue;
    seen.add(ruleId);

    rules.push({
      id: ruleId,
      name: categoryName(v.attack.category),
      shortDescription: { text: categoryDescription(v.attack.category) },
      defaultConfiguration: {
        level: severityToLevel(v.attack.severity),
      },
      properties: {
        tags: ['security', v.attack.category],
      },
    });
  }

  return rules;
}

function toSarifResult(r: AttackResult) {
  return {
    ruleId: `SENTINEL/${r.attack.category}`,
    level: severityToLevel(r.attack.severity),
    message: {
      text: `${r.attack.name}: ${r.evidence}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: r.pageUrl,
            uriBaseId: 'WEBROOT',
          },
        },
        logicalLocations: [
          {
            name: r.attack.target.selector || r.attack.target.url || r.pageUrl,
            kind: r.attack.target.type,
          },
        ],
      },
    ],
    properties: {
      severity: r.attack.severity,
      duration: r.duration,
      reproductionSteps: r.reproductionSteps,
      screenshot: r.screenshot || undefined,
    },
  };
}

function severityToLevel(severity: string): string {
  switch (severity) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'note';
    default: return 'warning';
  }
}

function categoryName(cat: string): string {
  const names: Record<string, string> = {
    injection: 'SQL/NoSQL Injection',
    xss: 'Cross-Site Scripting (XSS)',
    auth: 'Authentication Bypass',
    traversal: 'Path Traversal',
    validation: 'Input Validation',
    cors: 'CORS Misconfiguration',
    csrf: 'Cross-Site Request Forgery',
    storage: 'Browser Storage Exposure',
    dos: 'Denial of Service',
    ssrf: 'Server-Side Request Forgery',
    idor: 'Insecure Direct Object Reference',
    'info-leak': 'Information Disclosure',
    redirect: 'Open Redirect',
    functional: 'Functional Test Failure',
    exploratory: 'Exploratory Test Finding',
    accessibility: 'Accessibility Violation (WCAG)',
    ux: 'UX / Usability Issue',
  };
  return names[cat] || cat;
}

function categoryDescription(cat: string): string {
  const descs: Record<string, string> = {
    injection: 'Application is vulnerable to SQL or NoSQL injection via unparameterized queries',
    xss: 'Application reflects or stores user input without proper sanitization',
    auth: 'Sensitive resources accessible without proper authentication',
    traversal: 'Application allows reading arbitrary files via directory traversal',
    validation: 'Application does not properly validate input boundaries and types',
    cors: 'Application returns overly permissive CORS headers',
    csrf: 'Application does not protect state-changing operations with CSRF tokens',
    storage: 'Sensitive data (tokens, credentials, PII) exposed in browser localStorage or sessionStorage',
    dos: 'Application is vulnerable to resource exhaustion or denial of service',
    ssrf: 'Application can be tricked into making requests to arbitrary internal or external URLs',
    idor: 'Application exposes resources via predictable IDs without authorization checks',
    'info-leak': 'Application exposes sensitive information such as credentials, API keys, or internal configuration',
    redirect: 'Application redirects users to arbitrary URLs without validation',
    accessibility: 'Application has WCAG accessibility violations such as missing alt text, labels, or heading hierarchy',
    ux: 'Application has usability issues such as broken images, dead links, or slow page loads',
    functional: 'Application feature does not behave as expected per documentation',
    exploratory: 'Unexpected behavior discovered during edge-case exploration',
  };
  return descs[cat] || `Security vulnerability: ${cat}`;
}
