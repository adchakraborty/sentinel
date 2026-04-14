import { NemesisReport, AttackResult, AttackCategory } from '../types.js';

const REMEDIATION: Record<string, { title: string; fix: string; cwe: string }> = {
  injection: { title: 'SQL/NoSQL Injection', fix: 'Use parameterized queries or prepared statements. Never concatenate user input into SQL strings. Apply input validation and use an ORM.', cwe: 'CWE-89' },
  xss: { title: 'Cross-Site Scripting', fix: 'Encode all user-supplied output using context-aware encoding (HTML, JS, URL). Use Content-Security-Policy headers. Sanitize HTML with a library like DOMPurify.', cwe: 'CWE-79' },
  auth: { title: 'Authentication Bypass', fix: 'Enforce server-side authentication on all protected routes. Use middleware guards. Never rely solely on client-side routing for access control.', cwe: 'CWE-287' },
  traversal: { title: 'Path Traversal', fix: 'Validate and sanitize file paths. Use path.resolve() and verify the resolved path stays within the intended directory. Reject paths containing ".." sequences.', cwe: 'CWE-22' },
  validation: { title: 'Input Validation', fix: 'Implement server-side validation for all inputs. Define maximum lengths, allowed character sets, and format constraints. Return clear error messages.', cwe: 'CWE-20' },
  cors: { title: 'CORS Misconfiguration', fix: 'Never reflect arbitrary origins. Whitelist specific trusted origins. Never use Access-Control-Allow-Credentials with wildcard origins. Audit CORS headers regularly.', cwe: 'CWE-942' },
  csrf: { title: 'Cross-Site Request Forgery', fix: 'Implement anti-CSRF tokens on all state-changing operations. Use SameSite cookie attribute. Verify the Origin/Referer header on the server.', cwe: 'CWE-352' },
  storage: { title: 'Browser Storage Exposure', fix: 'Never store sensitive data (tokens, credentials, PII) in localStorage or sessionStorage. Use httpOnly secure cookies for session management. Encrypt any client-side data.', cwe: 'CWE-922' },
  dos: { title: 'Denial of Service', fix: 'Implement rate limiting. Set request size limits. Use timeouts. Avoid catastrophic regex backtracking. Use streaming for large payloads.', cwe: 'CWE-400' },
  ssrf: { title: 'Server-Side Request Forgery', fix: 'Validate and whitelist allowed URLs/domains. Block requests to internal networks (127.0.0.1, 10.x, 172.16.x, 192.168.x). Use a URL parser to verify the scheme and host.', cwe: 'CWE-918' },
  idor: { title: 'Insecure Direct Object Reference', fix: 'Implement authorization checks on every resource access. Verify the requesting user has permission to access the specific resource ID. Use indirect references.', cwe: 'CWE-639' },
  'info-leak': { title: 'Information Disclosure', fix: 'Remove debug endpoints in production. Never expose stack traces, database schemas, or environment variables. Use generic error messages. Remove verbose server headers.', cwe: 'CWE-200' },
  redirect: { title: 'Open Redirect', fix: 'Validate redirect URLs against a whitelist of allowed domains. Never redirect to user-supplied URLs without validation. Use relative paths for internal redirects.', cwe: 'CWE-601' },
  functional: { title: 'Functional Issue', fix: 'Review the failing feature against product requirements. Add regression tests. Verify expected behavior matches documentation.', cwe: 'N/A' },
  exploratory: { title: 'Exploratory Finding', fix: 'Investigate the unexpected behavior. Add error handling for edge cases. Document expected behavior for boundary conditions.', cwe: 'N/A' },
  accessibility: { title: 'Accessibility Violation', fix: 'Add alt text to all images. Associate labels with form inputs. Maintain proper heading hierarchy. Add skip-to-content links. Ensure sufficient color contrast (WCAG 2.1 AA: 4.5:1 for text).', cwe: 'CWE-1064' },
  ux: { title: 'UX / Usability Issue', fix: 'Fix broken images and dead links. Add loading indicators. Ensure all form inputs have labels or placeholders. Optimize page load time to under 3 seconds. Prevent content overflow.', cwe: 'N/A' },
};

export function generateMarkdownReport(report: NemesisReport): string {
  const lines: string[] = [];

  lines.push(`# SENTINEL Penetration Test Report`);
  lines.push(`\n> *AI Red Team — Autonomous Penetration Testing*`);
  lines.push(`\n**Target:** ${report.target}`);
  lines.push(`**Date:** ${new Date(report.startedAt).toLocaleDateString()}`);
  lines.push(`**Duration:** ${(report.duration / 1000).toFixed(1)} seconds`);
  if (report.timeToFirstBreach !== undefined) {
    lines.push(`**Time to First Breach:** ${(report.timeToFirstBreach / 1000).toFixed(1)} seconds`);
  }

  // Severity summary
  lines.push(`\n## Executive Summary\n`);
  lines.push(`SENTINEL scanned **${report.pagesScanned} pages**, executed **${report.attacksExecuted} attacks**, and found **${report.vulnerabilitiesFound} vulnerabilities**.`);

  lines.push(`\n| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Pages Scanned | ${report.pagesScanned} |`);
  lines.push(`| Attacks Executed | ${report.attacksExecuted} |`);
  lines.push(`| Vulnerabilities Found | **${report.vulnerabilitiesFound}** |`);
  lines.push(`| Critical | ${report.criticalCount} |`);
  lines.push(`| High | ${report.highCount} |`);
  lines.push(`| Medium | ${report.mediumCount} |`);
  lines.push(`| Low | ${report.lowCount} |`);

  // Risk score
  const riskScore = calculateRiskScore(report);
  lines.push(`\n### Risk Score: ${riskScore}/100 ${riskLabel(riskScore)}\n`);

  // Attack surface
  lines.push(`## Attack Surface\n`);
  lines.push('```mermaid');
  lines.push('flowchart TB');
  lines.push(`    TARGET(["${report.target}"]):::target`);
  for (let i = 0; i < Math.min(report.pages.length, 10); i++) {
    const p = report.pages[i];
    const pageId = `P${i}`;
    const pathname = safeLabel(new URL(p.url).pathname || '/');
    const formCount = p.forms.length;
    const inputCount = p.inputs.length + p.forms.reduce((s, f) => s + f.inputs.length, 0);
    lines.push(`    ${pageId}["${pathname}\\n${formCount} forms, ${inputCount} inputs"]:::page`);
    lines.push(`    TARGET --> ${pageId}`);

    const pageVulns = report.results.filter((r) => r.success && r.pageUrl === p.url);
    for (let j = 0; j < Math.min(pageVulns.length, 3); j++) {
      const v = pageVulns[j];
      const vulnId = `V${i}_${j}`;
      lines.push(`    ${vulnId}("${safeLabel(v.attack.name, 35)}"):::vuln`);
      lines.push(`    ${pageId} --> ${vulnId}`);
    }
  }
  lines.push('    classDef target fill:#1e40af,stroke:#1e3a8a,color:#fff');
  lines.push('    classDef page fill:#374151,stroke:#1f2937,color:#fff');
  lines.push('    classDef vuln fill:#dc2626,stroke:#991b1b,color:#fff');
  lines.push('```');

  // Confirmed vulnerabilities
  const vulns = report.results.filter((r) => r.success);
  if (vulns.length > 0) {
    lines.push(`\n## Confirmed Vulnerabilities\n`);

    const bySeverity = groupBySeverity(vulns);
    for (const [severity, group] of Object.entries(bySeverity)) {
      lines.push(`### ${severityBadge(severity)} ${capitalize(severity)} (${group.length})\n`);

      for (const result of group) {
        lines.push(`#### ${result.attack.name}\n`);
        lines.push(`- **Category:** ${result.attack.category}`);
        lines.push(`- **Page:** \`${result.pageUrl}\``);
        lines.push(`- **Evidence:** ${result.evidence}`);
        lines.push(`- **Duration:** ${result.duration}ms`);

        if (result.screenshot) {
          lines.push(`- **Screenshot:** \`${result.screenshot}\``);
        }

        const rem = REMEDIATION[result.attack.category];
        if (rem) {
          lines.push(`- **CWE:** ${rem.cwe}`);
          lines.push(`- **Remediation:** ${rem.fix}`);
        }

        lines.push(`\n<details>\n<summary><b>Reproduction Steps</b></summary>\n`);
        for (let i = 0; i < result.reproductionSteps.length; i++) {
          lines.push(`${i + 1}. ${result.reproductionSteps[i]}`);
        }
        lines.push(`\n</details>\n`);
      }
    }
  }

  // Pages scanned
  lines.push(`## Pages Scanned\n`);
  lines.push('| # | URL | Forms | Inputs | Links |');
  lines.push('|---|-----|-------|--------|-------|');
  for (let i = 0; i < report.pages.length; i++) {
    const p = report.pages[i];
    const totalInputs = p.inputs.length + p.forms.reduce((s, f) => s + f.inputs.length, 0);
    lines.push(`| ${i + 1} | \`${shortenUrl(p.url)}\` | ${p.forms.length} | ${totalInputs} | ${p.links.filter((l) => l.isInternal).length} |`);
  }

  // Footer
  lines.push(`\n---\n`);
  lines.push(`*Generated by SENTINEL v3.2 — AI Security & QA*`);
  lines.push(`*${new Date().toISOString()}*`);

  return lines.join('\n');
}

export function generateHtmlReport(report: NemesisReport): string {
  const vulns = report.results.filter((r) => r.success);
  const riskScore = calculateRiskScore(report);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SENTINEL Report — ${report.target}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2.5rem; color: #ef4444; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; color: #f8fafc; margin: 2rem 0 1rem; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .stat { background: #1e293b; border-radius: 12px; padding: 1.5rem; text-align: center; border: 1px solid #334155; }
    .stat-value { font-size: 2.5rem; font-weight: 800; }
    .stat-label { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .critical { color: #ef4444; }
    .high { color: #f97316; }
    .medium { color: #eab308; }
    .low { color: #22c55e; }
    .risk-bar { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin: 1.5rem 0; border: 1px solid #334155; }
    .risk-fill { height: 24px; border-radius: 8px; transition: width 0.5s; }
    .risk-score { font-size: 3rem; font-weight: 900; }
    .vuln-card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; border-left: 4px solid; }
    .vuln-card.severity-critical { border-color: #ef4444; }
    .vuln-card.severity-high { border-color: #f97316; }
    .vuln-card.severity-medium { border-color: #eab308; }
    .vuln-card.severity-low { border-color: #22c55e; }
    .vuln-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .badge-critical { background: #ef4444; color: #fff; }
    .badge-high { background: #f97316; color: #fff; }
    .badge-medium { background: #eab308; color: #000; }
    .badge-low { background: #22c55e; color: #000; }
    .evidence { background: #0f172a; padding: 1rem; border-radius: 8px; margin: 0.5rem 0; font-family: monospace; font-size: 0.9rem; color: #fbbf24; }
    .steps { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
    .steps li { margin: 0.3rem 0; color: #cbd5e1; }
    .meta { color: #64748b; font-size: 0.85rem; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }
    td { color: #e2e8f0; }
    .footer { text-align: center; color: #475569; margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #1e293b; }
    .pulse { animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>SENTINEL</h1>
    <p class="subtitle">AI Red Team — Autonomous Penetration Test Report</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${report.pagesScanned}</div>
        <div class="stat-label">Pages Scanned</div>
      </div>
      <div class="stat">
        <div class="stat-value">${report.attacksExecuted}</div>
        <div class="stat-label">Attacks Executed</div>
      </div>
      <div class="stat">
        <div class="stat-value ${report.vulnerabilitiesFound > 0 ? 'critical pulse' : 'low'}">${report.vulnerabilitiesFound}</div>
        <div class="stat-label">Vulnerabilities</div>
      </div>
      <div class="stat">
        <div class="stat-value">${(report.duration / 1000).toFixed(1)}s</div>
        <div class="stat-label">Duration</div>
      </div>
      ${report.timeToFirstBreach !== undefined ? `<div class="stat">
        <div class="stat-value critical">${(report.timeToFirstBreach / 1000).toFixed(1)}s</div>
        <div class="stat-label">Time to Breach</div>
      </div>` : ''}
    </div>

    <div class="risk-bar">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
        <span class="stat-label">Risk Score</span>
        <span class="risk-score ${riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : 'low'}">${riskScore}/100</span>
      </div>
      <div style="background:#334155;border-radius:8px;overflow:hidden;">
        <div class="risk-fill" style="width:${riskScore}%;background:${riskScore >= 70 ? '#ef4444' : riskScore >= 40 ? '#f97316' : '#22c55e'};"></div>
      </div>
    </div>

    <h2>Target: ${escapeHtml(report.target)}</h2>
    <p>Scan started: ${new Date(report.startedAt).toLocaleString()} | Completed: ${new Date(report.completedAt).toLocaleString()}</p>

    <div class="stats" style="margin-top:1rem;">
      <div class="stat"><div class="stat-value critical">${report.criticalCount}</div><div class="stat-label">Critical</div></div>
      <div class="stat"><div class="stat-value high">${report.highCount}</div><div class="stat-label">High</div></div>
      <div class="stat"><div class="stat-value medium">${report.mediumCount}</div><div class="stat-label">Medium</div></div>
      <div class="stat"><div class="stat-value low">${report.lowCount}</div><div class="stat-label">Low</div></div>
    </div>

    ${vulns.length > 0 ? `<h2>Confirmed Vulnerabilities</h2>
    ${vulns.map((v) => {
      const rem = REMEDIATION[v.attack.category];
      return `
    <div class="vuln-card severity-${v.attack.severity}">
      <div class="vuln-title">
        <span class="badge badge-${v.attack.severity}">${v.attack.severity}</span>
        ${escapeHtml(v.attack.name)}
      </div>
      <p><strong>Category:</strong> ${v.attack.category}${rem ? ` (${rem.cwe})` : ''} | <strong>Page:</strong> ${escapeHtml(v.pageUrl)}</p>
      <div class="evidence">${escapeHtml(v.evidence)}</div>
      ${rem ? `<div style="background:#0f2a1a;border:1px solid #166534;border-radius:8px;padding:0.75rem;margin:0.5rem 0;">
        <strong style="color:#22c55e;">Remediation:</strong> <span style="color:#86efac;">${escapeHtml(rem.fix)}</span>
      </div>` : ''}
      <details style="margin-top:0.5rem;"><summary style="cursor:pointer;color:#94a3b8;font-size:0.85rem;"><b>Reproduction Steps</b></summary>
      <ol class="steps">${v.reproductionSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      </details>
      <p class="meta">Duration: ${v.duration}ms | ${v.timestamp}</p>
    </div>`;
    }).join('')}

    <h2>Category Breakdown</h2>
    <div class="stats" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      ${Object.entries(vulns.reduce((acc: Record<string, number>, v) => { acc[v.attack.category] = (acc[v.attack.category] || 0) + 1; return acc; }, {})).map(([cat, count]) => `
      <div class="stat">
        <div class="stat-value" style="font-size:1.8rem;">${count}</div>
        <div class="stat-label">${cat}</div>
      </div>`).join('')}
    </div>

    <h2>Remediation Summary</h2>
    <table>
      <thead><tr><th>Category</th><th>CWE</th><th>Findings</th><th>Recommended Fix</th></tr></thead>
      <tbody>
        ${Object.entries(vulns.reduce((acc: Record<string, number>, v) => { acc[v.attack.category] = (acc[v.attack.category] || 0) + 1; return acc; }, {})).map(([cat, count]) => {
          const rem = REMEDIATION[cat];
          return `<tr>
            <td><strong>${rem?.title || cat}</strong></td>
            <td>${rem?.cwe || 'N/A'}</td>
            <td>${count}</td>
            <td style="font-size:0.85rem;">${rem ? escapeHtml(rem.fix) : 'Review and fix'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<h2>No Vulnerabilities Found</h2><p style="color:#22c55e;">The target appears resilient to the tested attack vectors. All tests passed.</p>'}

    <h2>Pages Scanned</h2>
    <table>
      <thead><tr><th>#</th><th>URL</th><th>Forms</th><th>Inputs</th><th>Links</th></tr></thead>
      <tbody>
        ${report.pages.map((p, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(shortenUrl(p.url))}</td>
          <td>${p.forms.length}</td>
          <td>${p.inputs.length + p.forms.reduce((s, f) => s + f.inputs.length, 0)}</td>
          <td>${p.links.filter((l) => l.isInternal).length}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="footer">
      <p>Generated by SENTINEL v3.2 — AI Security & QA</p>
      <p>${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>`;
}

function calculateRiskScore(report: NemesisReport): number {
  if (report.attacksExecuted === 0) return 0;
  const score =
    report.criticalCount * 30 +
    report.highCount * 20 +
    report.mediumCount * 10 +
    report.lowCount * 5;
  return Math.min(Math.round(score), 100);
}

function riskLabel(score: number): string {
  if (score >= 70) return '**CRITICAL RISK**';
  if (score >= 40) return '**HIGH RISK**';
  if (score >= 20) return '**MODERATE RISK**';
  return '**LOW RISK**';
}

function severityBadge(severity: string): string {
  return `[${severity.toUpperCase()}]`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function safeLabel(s: string, max = 50): string {
  return s.replace(/"/g, "'").replace(/\n/g, ' ').replace(/[[\]{}()#&<>]/g, '').substring(0, max);
}

function groupBySeverity(results: AttackResult[]): Record<string, AttackResult[]> {
  const order = ['critical', 'high', 'medium', 'low'];
  const grouped: Record<string, AttackResult[]> = {};
  for (const sev of order) {
    const items = results.filter((r) => r.attack.severity === sev);
    if (items.length > 0) grouped[sev] = items;
  }
  return grouped;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
