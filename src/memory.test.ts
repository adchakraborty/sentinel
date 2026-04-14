import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadKnowledge, saveKnowledge, addScanRecord, addEffectivePayloads,
  addTestPlan, upsertAppProfile, urlToKey, getKnowledgeForUrl,
  getKnowledgeSummary, KnowledgeBase, AppProfile, ScanRecord, EffectivePayload,
} from './memory.js';

const TEST_DIR = join(process.cwd(), '.test-tmp');
const TEST_KB_PATH = join(TEST_DIR, 'test-knowledge.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  process.env.NEMESIS_KNOWLEDGE_PATH = TEST_KB_PATH;
});

afterEach(() => {
  delete process.env.NEMESIS_KNOWLEDGE_PATH;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('urlToKey', () => {
  it('extracts host from a valid URL', () => {
    expect(urlToKey('https://example.com/path?q=1')).toBe('example.com');
  });

  it('extracts host with port', () => {
    expect(urlToKey('http://localhost:3001/app')).toBe('localhost:3001');
  });

  it('returns raw string for invalid URL', () => {
    expect(urlToKey('not-a-url')).toBe('not-a-url');
  });
});

describe('loadKnowledge / saveKnowledge', () => {
  it('returns empty KB when file does not exist', () => {
    const kb = loadKnowledge();
    expect(kb.apps).toEqual([]);
    expect(kb.scanHistory).toEqual([]);
    expect(kb.effectivePayloads).toEqual([]);
    expect(kb.testPlans).toEqual([]);
  });

  it('round-trips a knowledge base through save/load', () => {
    const kb = loadKnowledge();
    kb.apps.push({
      id: 'app-1', name: 'TestApp', url: 'http://localhost:3000',
      urlKey: 'localhost:3000', techStack: ['node', 'express'],
      routes: ['/home', '/api'], learnedAt: '2026-01-01T00:00:00Z',
    });
    saveKnowledge(kb);

    const loaded = loadKnowledge();
    expect(loaded.apps).toHaveLength(1);
    expect(loaded.apps[0].name).toBe('TestApp');
    expect(loaded.apps[0].techStack).toEqual(['node', 'express']);
  });

  it('handles corrupted JSON gracefully', () => {
    const { writeFileSync } = require('node:fs');
    writeFileSync(TEST_KB_PATH, '{ broken json !!!', 'utf8');
    const kb = loadKnowledge();
    expect(kb.apps).toEqual([]);
  });
});

describe('addScanRecord', () => {
  it('appends a scan record and persists', () => {
    const kb = loadKnowledge();
    const record: ScanRecord = {
      id: 'scan-1', appId: 'localhost:3000', timestamp: '2026-01-01T00:00:00Z',
      pagesScanned: 5, attacksExecuted: 20, vulnerabilitiesFound: 3,
      findings: ['[critical] SQLi', '[high] XSS'],
    };
    addScanRecord(kb, record);

    const loaded = loadKnowledge();
    expect(loaded.scanHistory).toHaveLength(1);
    expect(loaded.scanHistory[0].id).toBe('scan-1');
    expect(loaded.scanHistory[0].vulnerabilitiesFound).toBe(3);
  });
});

describe('addEffectivePayloads', () => {
  it('appends payloads and persists', () => {
    const kb = loadKnowledge();
    const payloads: EffectivePayload[] = [
      { payload: "' OR 1=1 --", category: 'injection', targetType: 'form', successIndicator: 'error', appId: 'localhost:3000', discoveredAt: '2026-01-01T00:00:00Z' },
      { payload: '<script>alert(1)</script>', category: 'xss', targetType: 'form', successIndicator: 'alert', appId: 'localhost:3000', discoveredAt: '2026-01-01T00:00:00Z' },
    ];
    addEffectivePayloads(kb, payloads);

    const loaded = loadKnowledge();
    expect(loaded.effectivePayloads).toHaveLength(2);
    expect(loaded.effectivePayloads[0].category).toBe('injection');
  });
});

describe('upsertAppProfile', () => {
  it('inserts a new app profile', () => {
    const kb = loadKnowledge();
    const profile: AppProfile = {
      id: 'app-1', name: 'NewApp', url: 'http://localhost:4000',
      urlKey: 'localhost:4000', techStack: ['react'], routes: ['/'],
      learnedAt: '2026-01-01T00:00:00Z',
    };
    upsertAppProfile(kb, profile);

    const loaded = loadKnowledge();
    expect(loaded.apps).toHaveLength(1);
    expect(loaded.apps[0].name).toBe('NewApp');
  });

  it('updates an existing app profile by urlKey', () => {
    const kb = loadKnowledge();
    const profile1: AppProfile = {
      id: 'app-1', name: 'OldName', url: 'http://localhost:4000',
      urlKey: 'localhost:4000', techStack: ['react'], routes: ['/'],
      learnedAt: '2026-01-01T00:00:00Z',
    };
    upsertAppProfile(kb, profile1);

    const profile2: AppProfile = {
      id: 'app-2', name: 'NewName', url: 'http://localhost:4000',
      urlKey: 'localhost:4000', techStack: ['react', 'node'], routes: ['/', '/api'],
      learnedAt: '2026-02-01T00:00:00Z',
    };
    upsertAppProfile(kb, profile2);

    const loaded = loadKnowledge();
    expect(loaded.apps).toHaveLength(1);
    expect(loaded.apps[0].name).toBe('NewName');
    expect(loaded.apps[0].techStack).toEqual(['react', 'node']);
  });
});

describe('getKnowledgeForUrl', () => {
  it('returns scoped data for a given URL', () => {
    const kb = loadKnowledge();

    upsertAppProfile(kb, {
      id: 'app-1', name: 'App1', url: 'http://localhost:3000',
      urlKey: 'localhost:3000', techStack: [], routes: [],
      learnedAt: '2026-01-01T00:00:00Z',
    });
    addScanRecord(kb, {
      id: 'scan-1', appId: 'localhost:3000', timestamp: '2026-01-01T00:00:00Z',
      pagesScanned: 3, attacksExecuted: 10, vulnerabilitiesFound: 1, findings: [],
    });
    addScanRecord(kb, {
      id: 'scan-2', appId: 'other-host:8080', timestamp: '2026-01-02T00:00:00Z',
      pagesScanned: 1, attacksExecuted: 5, vulnerabilitiesFound: 0, findings: [],
    });

    const result = getKnowledgeForUrl(kb, 'http://localhost:3000/any-path');
    expect(result.app?.name).toBe('App1');
    expect(result.scans).toHaveLength(1);
    expect(result.scans[0].id).toBe('scan-1');
  });

  it('returns empty results for unknown URL', () => {
    const kb = loadKnowledge();
    const result = getKnowledgeForUrl(kb, 'http://unknown.com');
    expect(result.app).toBeUndefined();
    expect(result.scans).toEqual([]);
    expect(result.payloads).toEqual([]);
  });
});

describe('knowledge base pruning', () => {
  it('prunes scan history beyond 50 entries', () => {
    const kb = loadKnowledge();
    for (let i = 0; i < 60; i++) {
      kb.scanHistory.push({
        id: `scan-${i}`, appId: 'test', timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        pagesScanned: 1, attacksExecuted: 1, vulnerabilitiesFound: 0, findings: [],
      });
    }
    saveKnowledge(kb);

    const loaded = loadKnowledge();
    expect(loaded.scanHistory.length).toBeLessThanOrEqual(50);
    expect(loaded.scanHistory[loaded.scanHistory.length - 1].id).toBe('scan-59');
  });
});

describe('getKnowledgeSummary', () => {
  it('returns a non-empty summary string', () => {
    const kb = loadKnowledge();
    upsertAppProfile(kb, {
      id: 'app-1', name: 'TestApp', url: 'http://localhost:3000',
      urlKey: 'localhost:3000', techStack: ['node'], routes: ['/'],
      learnedAt: '2026-01-01T00:00:00Z',
    });

    const summary = getKnowledgeSummary(kb);
    expect(summary).toContain('TestApp');
    expect(summary).toContain('App profiles');
  });
});
