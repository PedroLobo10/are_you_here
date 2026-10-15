import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateStats, createSession } from '../src/core';
import { freshState, loadState, STORAGE_KEY, validateBackup } from '../src/storage';
import type { AppState } from '../src/types';

function withSession(): AppState {
  const app = freshState();
  app.demoMode = true;
  app.sessions = [createSession(app, 'learning', [app.questions[0].id], '2026-10-14T12:00:00Z')];
  app.sessions[0].status = 'completed';
  app.sessions[0].completedAt = '2026-10-14T12:00:00Z';
  app.sessions[0].attempts[0] = { ...app.sessions[0].attempts[0], initial: 'E', answer: 'E', confidenceRecorded: true, submitted: true, submittedAt: '2026-10-14T12:00:00Z' };
  return app;
}
function memoryStorage() {
  const records = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => records.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { records.set(key, value); }), removeItem: vi.fn((key: string) => { records.delete(key); }), clear: vi.fn(() => records.clear()) };
  vi.stubGlobal('localStorage', storage);
  return storage;
}
afterEach(() => vi.unstubAllGlobals());

describe('backup schema and safe recovery', () => {
  it('accepts fresh data and preserves valid session evidence through JSON roundtrips', () => {
    expect(validateBackup(freshState())).toBe(true);
    const app = withSession();
    const restored: unknown = JSON.parse(JSON.stringify(app));
    expect(validateBackup(restored)).toBe(true);
    if (validateBackup(restored)) expect(calculateStats(restored)).toEqual(calculateStats(app));
  });

  it.each([
    ['null snapshot scoring rule', (app: any) => { app.sessions[0].rules.blocks = [null]; }],
    ['invalid snapshot scoring magnitude', (app: any) => { app.sessions[0].rules.blocks[0].gain = -1; }],
    ['null key-history row', (app: any) => { app.questions[0].keyHistory = [null]; }],
    ['invalid answer-change row', (app: any) => { app.sessions[0].attempts[0].changes = [null]; }],
    ['missing explanation steps', (app: any) => { delete app.questions[0].explanation.steps; }],
    ['object in optional code text', (app: any) => { app.questions[0].code = {}; }],
    ['object in optional explanation concept', (app: any) => { app.questions[0].explanation.concept = {}; }],
    ['object in optional extracted source text', (app: any) => { app.sources[0].extractedText = {}; }],
    ['invalid confidence-recorded boolean', (app: any) => { app.sessions[0].attempts[0].confidenceRecorded = 'false'; }],
    ['missing rule dates list', (app: any) => { delete app.rules.dates; }],
    ['invalid answer enum', (app: any) => { app.sessions[0].attempts[0].answer = 'A'; }],
    ['invalid session status', (app: any) => { app.sessions[0].status = 'not-a-status'; }],
    ['null source row', (app: any) => { app.sources = [null]; }],
    ['missing topic discipline', (app: any) => { app.topics = [{ id: 'x', name: 'x' }]; }],
    ['null writing criterion', (app: any) => { app.writings = [{ id: 'w', title: 'Texto', prompt: 'Proposta', response: '', rewrite: '', minutes: 20, createdAt: '2026-10-14T12:00:00Z', criteria: [null], rubricVerified: false, isDemo: false }]; }],
    ['null review record', (app: any) => { app.reviews = [null]; }],
    ['unsafe script URL in a question', (app: any) => { app.questions[0].sourceUrl = 'javascript:alert(1)'; }],
  ])('rejects %s before it can crash the UI or scoring', (_description, corrupt) => {
    const app: unknown = structuredClone(withSession());
    corrupt(app);
    expect(validateBackup(app)).toBe(false);
  });

  it('loads existing valid local state without resetting history', () => {
    const storage = memoryStorage();
    const app = withSession();
    storage.setItem(STORAGE_KEY, JSON.stringify(app));
    const loaded = loadState();
    expect(loaded.error).toBeNull();
    expect(loaded.state).toEqual(app);
    expect(calculateStats(loaded.state).attempts).toBe(1);
  });

  it('preserves corrupt original bytes and opens a fresh recovery state without writing', () => {
    const storage = memoryStorage();
    const original = '{"schemaVersion":1,"broken":';
    storage.setItem(STORAGE_KEY, original);
    storage.setItem.mockClear();
    const loaded = loadState();
    expect(loaded.error).not.toBeNull();
    expect(loaded.state.sessions).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('reports denied storage access without pretending persistence succeeded', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage denied'); } });
    const loaded = loadState();
    expect(loaded.error).toContain('armazenamento');
    expect(loaded.state.schemaVersion).toBe(1);
  });
});
