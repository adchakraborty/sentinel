/**
 * Persistent scan knowledge for NEMESIS (`./nemesis-knowledge.json` by default).
 * Path: env `NEMESIS_KNOWLEDGE_PATH`, else `./nemesis-knowledge.json` under `process.cwd()`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DEFAULT_KNOWLEDGE_RELATIVE_PATH = './nemesis-knowledge.json';

export interface TestStep {
  action: string;
  target: string;
  expectedResult: string;
  type: 'functional' | 'security' | 'exploratory';
}

export interface AppProfile {
  id: string;
  name: string;
  url: string;
  urlKey: string;
  techStack: string[];
  routes: string[];
  learnedAt: string;
  fromDocs?: string;
  auth?: AuthConfig;
  exampleData?: Record<string, string>;
}

export interface AuthConfig {
  type: 'form-login' | 'idp-login' | 'cookie' | 'bearer' | 'basic' | 'none';
  loginUrl?: string;
  username?: string;
  password?: string;
  token?: string;
  cookies?: Record<string, string>;
  usernameField?: string;
  passwordField?: string;
  loginTrigger?: string;
  consentButton?: string;
  postLoginUrlPattern?: string;
}

export interface ScanRecord {
  id: string;
  appId: string;
  timestamp: string;
  pagesScanned: number;
  attacksExecuted: number;
  vulnerabilitiesFound: number;
  findings: string[];
}

export interface EffectivePayload {
  payload: string;
  category: string;
  targetType: string;
  successIndicator: string;
  appId: string;
  discoveredAt: string;
}

export interface TestPlan {
  id: string;
  appId: string;
  name: string;
  description: string;
  steps: TestStep[];
  createdAt: string;
  fromDocs?: string;
}

export interface KnowledgeBase {
  apps: AppProfile[];
  scanHistory: ScanRecord[];
  effectivePayloads: EffectivePayload[];
  testPlans: TestPlan[];
}

function resolvedKnowledgePath(): string {
  const fromEnv = process.env.NEMESIS_KNOWLEDGE_PATH?.trim();
  return resolve(process.cwd(), fromEnv || DEFAULT_KNOWLEDGE_RELATIVE_PATH);
}

function emptyKnowledgeBase(): KnowledgeBase {
  return {
    apps: [],
    scanHistory: [],
    effectivePayloads: [],
    testPlans: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string') ? value : [];
}

function asTestSteps(value: unknown): TestStep[] {
  if (!Array.isArray(value)) return [];
  const steps: TestStep[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const type = item.type;
    if (type !== 'functional' && type !== 'security' && type !== 'exploratory') continue;
    const action = item.action;
    const target = item.target;
    const expectedResult = item.expectedResult;
    if (typeof action !== 'string' || typeof target !== 'string' || typeof expectedResult !== 'string') {
      continue;
    }
    steps.push({ action, target, expectedResult, type });
  }
  return steps;
}

function normalizeKnowledgeBase(raw: unknown): KnowledgeBase {
  const base = emptyKnowledgeBase();
  if (!isRecord(raw)) return base;

  if (Array.isArray(raw.apps)) {
    for (const a of raw.apps) {
      if (!isRecord(a)) continue;
      const id = a.id;
      const name = a.name;
      const url = a.url;
      if (typeof id !== 'string' || typeof name !== 'string' || typeof url !== 'string') continue;
      const learnedAt = typeof a.learnedAt === 'string' ? a.learnedAt : new Date().toISOString();
      const urlKey = typeof a.urlKey === 'string' ? a.urlKey : urlToKey(url);
      base.apps.push({
        id,
        name,
        url,
        urlKey,
        techStack: asStringArray(a.techStack),
        routes: asStringArray(a.routes),
        learnedAt,
        fromDocs: typeof a.fromDocs === 'string' ? a.fromDocs : undefined,
        auth: isRecord(a.auth) ? a.auth as unknown as AuthConfig : undefined,
        exampleData: isRecord(a.exampleData) ? a.exampleData as unknown as Record<string, string> : undefined,
      });
    }
  }

  if (Array.isArray(raw.scanHistory)) {
    for (const s of raw.scanHistory) {
      if (!isRecord(s)) continue;
      const id = s.id;
      const appId = s.appId;
      const timestamp = s.timestamp;
      if (typeof id !== 'string' || typeof appId !== 'string' || typeof timestamp !== 'string') continue;
      const pagesScanned = typeof s.pagesScanned === 'number' ? s.pagesScanned : 0;
      const attacksExecuted = typeof s.attacksExecuted === 'number' ? s.attacksExecuted : 0;
      const vulnerabilitiesFound = typeof s.vulnerabilitiesFound === 'number' ? s.vulnerabilitiesFound : 0;
      base.scanHistory.push({
        id,
        appId,
        timestamp,
        pagesScanned,
        attacksExecuted,
        vulnerabilitiesFound,
        findings: asStringArray(s.findings),
      });
    }
  }

  if (Array.isArray(raw.effectivePayloads)) {
    for (const p of raw.effectivePayloads) {
      if (!isRecord(p)) continue;
      const payload = p.payload;
      const category = p.category;
      const targetType = p.targetType;
      const successIndicator = p.successIndicator;
      const appId = p.appId;
      const discoveredAt = p.discoveredAt;
      if (
        typeof payload !== 'string' ||
        typeof category !== 'string' ||
        typeof targetType !== 'string' ||
        typeof successIndicator !== 'string' ||
        typeof appId !== 'string' ||
        typeof discoveredAt !== 'string'
      ) {
        continue;
      }
      base.effectivePayloads.push({
        payload,
        category,
        targetType,
        successIndicator,
        appId,
        discoveredAt,
      });
    }
  }

  if (Array.isArray(raw.testPlans)) {
    for (const t of raw.testPlans) {
      if (!isRecord(t)) continue;
      const id = t.id;
      const appId = t.appId;
      const name = t.name;
      const description = t.description;
      const createdAt = t.createdAt;
      if (
        typeof id !== 'string' ||
        typeof appId !== 'string' ||
        typeof name !== 'string' ||
        typeof description !== 'string' ||
        typeof createdAt !== 'string'
      ) {
        continue;
      }
      base.testPlans.push({
        id,
        appId,
        name,
        description,
        steps: asTestSteps(t.steps),
        createdAt,
        fromDocs: typeof t.fromDocs === 'string' ? t.fromDocs : undefined,
      });
    }
  }

  return base;
}

/**
 * Load the knowledge base from disk, or return an empty structure if missing or invalid.
 * Uses `NEMESIS_KNOWLEDGE_PATH` or `./nemesis-knowledge.json` under `process.cwd()`.
 */
export function loadKnowledge(): KnowledgeBase {
  const filePath = resolvedKnowledgePath();
  try {
    const text = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    return normalizeKnowledgeBase(parsed);
  } catch {
    return emptyKnowledgeBase();
  }
}

/**
 * Persist the full knowledge base to disk (creates parent directories if needed).
 */
export function saveKnowledge(kb: KnowledgeBase): void {
  const filePath = resolvedKnowledgePath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(kb, null, 2)}\n`, 'utf8');
}

export function addAppProfile(kb: KnowledgeBase, profile: AppProfile): void {
  kb.apps.push(profile);
  saveKnowledge(kb);
}

export function addScanRecord(kb: KnowledgeBase, record: ScanRecord): void {
  kb.scanHistory.push(record);
  saveKnowledge(kb);
}

export function addEffectivePayloads(kb: KnowledgeBase, payloads: EffectivePayload[]): void {
  kb.effectivePayloads.push(...payloads);
  saveKnowledge(kb);
}

export function addTestPlan(kb: KnowledgeBase, plan: TestPlan): void {
  kb.testPlans.push(plan);
  saveKnowledge(kb);
}

export function urlToKey(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

export function getAppByUrl(kb: KnowledgeBase, url: string): AppProfile | undefined {
  const key = urlToKey(url);
  return kb.apps.find((a) => a.urlKey === key);
}

export function getKnowledgeForUrl(kb: KnowledgeBase, url: string): {
  app: AppProfile | undefined;
  scans: ScanRecord[];
  payloads: EffectivePayload[];
  plans: TestPlan[];
} {
  const key = urlToKey(url);
  return {
    app: kb.apps.find((a) => a.urlKey === key),
    scans: kb.scanHistory.filter((s) => s.appId === key),
    payloads: kb.effectivePayloads.filter((p) => p.appId === key),
    plans: kb.testPlans.filter((p) => {
      const appForPlan = kb.apps.find((a) => a.id === p.appId);
      return appForPlan?.urlKey === key || p.appId === key;
    }),
  };
}

export function upsertAppProfile(kb: KnowledgeBase, profile: AppProfile): void {
  const idx = kb.apps.findIndex((a) => a.urlKey === profile.urlKey);
  if (idx >= 0) {
    kb.apps[idx] = { ...kb.apps[idx], ...profile, learnedAt: new Date().toISOString() };
  } else {
    kb.apps.push(profile);
  }
  saveKnowledge(kb);
}

export function getEffectivePayloadsForCategory(
  kb: KnowledgeBase,
  category: string
): EffectivePayload[] {
  const c = category.trim();
  return kb.effectivePayloads.filter((p) => p.category === c);
}

function summarizeList<T>(items: T[], label: string, max: number, format: (item: T, i: number) => string): string {
  if (items.length === 0) return `- ${label}: none`;
  const shown = items.slice(0, max);
  const lines = shown.map((item, i) => `  ${i + 1}. ${format(item, i)}`);
  const more = items.length > max ? `\n  ... and ${items.length - max} more` : '';
  return `- ${label} (${items.length}):\n${lines.join('\n')}${more}`;
}

/**
 * Compact, human-readable overview for LLM context.
 */
export function getKnowledgeSummary(kb: KnowledgeBase): string {
  const parts: string[] = ['NEMESIS knowledge base summary', ''];

  const recentScans = [...kb.scanHistory].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);

  parts.push(
    summarizeList(kb.apps, 'App profiles', 8, (a) => `${a.name} (${a.id}) — ${a.url} [${a.techStack.join(', ') || 'unknown stack'}]`)
  );
  parts.push('');
  parts.push(
    summarizeList(
      recentScans,
      'Recent scans (newest first, up to 5)',
      5,
      (s) =>
        `${s.timestamp} app=${s.appId} pages=${s.pagesScanned} attacks=${s.attacksExecuted} vulns=${s.vulnerabilitiesFound} — ${s.findings.slice(0, 2).join('; ') || 'no findings noted'}`
    )
  );
  parts.push('');
  parts.push(
    summarizeList(
      kb.effectivePayloads,
      'Effective payloads',
      10,
      (p) => `[${p.category}] ${p.targetType}: ${p.payload.slice(0, 80)}${p.payload.length > 80 ? '…' : ''} → ${p.successIndicator}`
    )
  );
  parts.push('');
  parts.push(
    summarizeList(kb.testPlans, 'Test plans', 6, (t) => `${t.name} (${t.id}) app=${t.appId} — ${t.steps.length} steps`)
  );

  return parts.join('\n');
}
