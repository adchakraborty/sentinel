interface ReconPage {
  url: string;
  title: string;
  forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string }> }>;
  links: Array<{ href: string; text: string }>;
  inputs: Array<{ name: string; type: string; selector: string }>;
  cookies: Array<{ name: string; httpOnly: boolean; secure: boolean }>;
  storage: { localStorage: Array<{ key: string }>; sessionStorage: Array<{ key: string }> };
  headers: Record<string, string>;
}

const ALL_CATEGORIES = [
  'injection', 'xss', 'auth', 'traversal', 'validation',
  'dos', 'cors', 'csrf', 'storage', 'functional', 'exploratory',
  'ssrf', 'idor', 'info-leak', 'redirect', 'accessibility', 'ux',
];

export function buildSystemPrompt(): string {
  return `You are SENTINEL, an expert AI penetration tester, accessibility auditor, and QA engineer. You analyze web application reconnaissance data and generate targeted attack plans.

You MUST return a JSON array of AttackPlan objects. Each AttackPlan has:
{
  "pageUrl": "string — the URL to test",
  "attacks": [
    {
      "id": "string — unique identifier like 'sqli-search-1'",
      "category": "one of: ${ALL_CATEGORIES.join(', ')}",
      "name": "string — human-readable name",
      "description": "string — what this test does",
      "target": {
        "type": "form | url-param | header | cookie | direct-url | storage",
        "selector": "CSS selector if targeting a form/input",
        "inputName": "name of the input field",
        "url": "specific URL to test if type is direct-url"
      },
      "payloads": ["array of test strings/payloads to try"],
      "successIndicators": ["strings/patterns that indicate the attack succeeded"],
      "severity": "critical | high | medium | low"
    }
  ]
}

Rules:
1. Cover ALL 16 attack categories when applicable
2. Generate 3-8 attacks per page, focusing on the most impactful
3. Tailor payloads to the specific tech stack and data model you see
4. For accessibility: check missing alt text, missing labels, heading hierarchy, skip links, lang attribute
5. For UX: check broken images, dead links, slow loads, unlabeled inputs, content overflow
6. For input validation: test null bytes, unicode, extremely long strings, special characters, empty required fields
7. Set severity based on real-world impact
8. Return ONLY the JSON array, no markdown fences or explanation`;
}

export function buildUserPrompt(
  pages: ReconPage[],
  docContent?: string,
  exampleData?: Record<string, string>,
): string {
  const parts: string[] = [];

  parts.push('## Reconnaissance Data\n');

  for (const page of pages) {
    parts.push(`### Page: ${page.url}`);
    parts.push(`Title: ${page.title}`);

    if (page.forms.length > 0) {
      parts.push(`Forms (${page.forms.length}):`);
      for (const form of page.forms) {
        parts.push(`  - ${form.method.toUpperCase()} ${form.action} — inputs: ${form.inputs.map((i) => `${i.name}(${i.type})`).join(', ')}`);
      }
    }

    if (page.inputs.length > 0) {
      parts.push(`Standalone inputs: ${page.inputs.map((i) => `${i.name}(${i.type})`).join(', ')}`);
    }

    if (page.cookies.length > 0) {
      parts.push(`Cookies: ${page.cookies.map((c) => `${c.name}(httpOnly:${c.httpOnly},secure:${c.secure})`).join(', ')}`);
    }

    const lsKeys = page.storage?.localStorage?.map((e) => e.key) || [];
    const ssKeys = page.storage?.sessionStorage?.map((e) => e.key) || [];
    if (lsKeys.length > 0) parts.push(`localStorage keys: ${lsKeys.join(', ')}`);
    if (ssKeys.length > 0) parts.push(`sessionStorage keys: ${ssKeys.join(', ')}`);

    const importantHeaders = ['x-powered-by', 'server', 'access-control-allow-origin', 'content-security-policy', 'x-frame-options'];
    const relevantHeaders = Object.entries(page.headers || {}).filter(([k]) => importantHeaders.includes(k.toLowerCase()));
    if (relevantHeaders.length > 0) {
      parts.push(`Security headers: ${relevantHeaders.map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }

    parts.push('');
  }

  if (docContent) {
    parts.push('## Application Documentation\n');
    parts.push(docContent.substring(0, 8000));
    parts.push('');
  }

  if (exampleData && Object.keys(exampleData).length > 0) {
    parts.push('## Example Data\n');
    parts.push(JSON.stringify(exampleData, null, 2));
    parts.push('');
  }

  parts.push(`Generate attack plans covering all 16 categories. Return ONLY a JSON array.`);

  return parts.join('\n');
}
