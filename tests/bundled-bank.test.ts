import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateStats, createSession } from '../src/core';
import { officialQuestionIdentity, validateQuestionBank } from '../src/question-bank';
import { officialQuestionBank } from '../src/source-data';
import { freshState, loadState, STORAGE_KEY, validateBackup } from '../src/storage';
import type { Question, SourceRecord } from '../src/types';

type DocumentKind = 'proof' | 'key' | 'keyChanges';
type PreservedDocument = { assetUrl: string; originalUrl: string; mirrorUrl: string; sha256: string };
type Provenance = {
  id: string;
  questionCount: number;
  questionNumbers: number[];
  proof: PreservedDocument;
  key: PreservedDocument;
  keyChanges?: PreservedDocument;
};
type BankSource = SourceRecord & { assetUrl: string; mirrorUrl: string; sha256: string; questionBankDocumentKind: DocumentKind };
type ProvenancedQuestion = Question & { sourceId: string; proofSha256: string; answerKeySha256: string; answerKeySourceUrl: string };

const canonicalText = readFileSync(new URL('../src/data/cebraspe-cgu-ti-v1.json', import.meta.url), 'utf8');
const publicText = readFileSync(new URL('../public/question-banks/cebraspe-cgu-ti-v1.json', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/question-banks/cebraspe-cgu-ti-provenance.json', import.meta.url), 'utf8')) as { version: string; provenance: Provenance[] };
const sources = officialQuestionBank.sources as BankSource[];
const date = '2026-10-15T12:00:00.000Z';

function memoryStorage() {
  const records = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { records.set(key, value); }),
    removeItem: vi.fn((key: string) => { records.delete(key); }),
    clear: vi.fn(() => records.clear()),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('bundled historical Cebraspe questions', () => {
  it('ships exactly the same canonical package in the application and public download', () => {
    expect(publicText).toBe(canonicalText);
    expect(officialQuestionBank).toEqual(JSON.parse(canonicalText));
    expect(manifest.version).toBe(officialQuestionBank.version);
    expect((JSON.parse(canonicalText) as { provenance: Provenance[] }).provenance).toEqual(manifest.provenance);
  });

  it('contains 78 unique official previous-exam items, with no author-created or demonstration question', () => {
    expect(officialQuestionBank.questions).toHaveLength(78);
    expect(new Set(officialQuestionBank.questions.map(q => q.id)).size).toBe(78);
    expect(new Set(officialQuestionBank.questions.map(officialQuestionIdentity)).size).toBe(78);
    for (const q of officialQuestionBank.questions) {
      expect(q.board, q.id).toBe('Cebraspe');
      expect(q.origin, q.id).toBe('official');
      expect(q.isDemo, q.id).toBe(false);
      expect(q.year, q.id).toBeGreaterThanOrEqual(2018);
      expect(q.year, q.id).toBeLessThanOrEqual(2024);
      expect(q.examId, q.id).toBeTruthy();
      expect(q.itemNumber, q.id).toMatch(/^\d+$/);
      expect(new URL(q.sourceUrl!).hostname, q.id).toBe('cdn.cebraspe.org.br');
      expect(q.explanation?.author, q.id).not.toBe('demo');
    }
  });

  it('links every question to the correct discipline, topic and block in the provided CGU syllabus', () => {
    const app = freshState();
    const topics = new Map(app.topics.map(topic => [topic.id, topic]));
    expect(app.topics).toHaveLength(205);
    const result = validateQuestionBank(officialQuestionBank, app.topics, app.rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.bank?.questions).toHaveLength(78);
    for (const q of officialQuestionBank.questions) {
      const topic = topics.get(q.topicId!);
      expect(topic, q.id).toBeDefined();
      expect({ discipline: q.discipline, topic: q.topic, block: q.block }, q.id).toEqual({ discipline: topic!.discipline, topic: topic!.name, block: topic!.block });
    }
  });

  it('keeps BCB 2024 item 118 officially changed from preliminary E to definitive C, version 2', () => {
    const item = officialQuestionBank.questions.find(q => q.id === 'cebraspe-bcb-2024-002-118');
    expect(item).toMatchObject({ itemNumber: '118', answer: 'C', keyStatus: 'changed', keyVersion: 2 });
    expect(item?.keyHistory).toHaveLength(2);
    expect(item?.keyHistory[0]).toMatchObject({ version: 1, answer: 'E', status: 'preliminary' });
    expect(item?.keyHistory[1]).toMatchObject({ version: 2, answer: 'C', status: 'changed' });
    expect(item?.keyHistory[0].source).toContain('JUSTIFICATIVAS');
    expect(item?.keyHistory[1].source).toContain('GAB_DEFINITIVO_959_BCB_002_01.PDF');
  });

  it('matches each question to its preserved proof, answer key and numbered source inventory', () => {
    expect(manifest.provenance).toHaveLength(5);
    expect(sources).toHaveLength(11);
    expect(new Set(sources.map(source => source.assetUrl)).size).toBe(11);
    expect(manifest.provenance.reduce((sum, group) => sum + group.questionCount, 0)).toBe(78);
    for (const group of manifest.provenance) {
      const questions = (officialQuestionBank.questions as ProvenancedQuestion[]).filter(q => q.sourceId === group.id);
      expect(questions, group.id).toHaveLength(group.questionCount);
      expect(questions.map(q => Number(q.itemNumber)).sort((a, b) => a - b), group.id).toEqual([...group.questionNumbers].sort((a, b) => a - b));
      for (const q of questions) {
        expect(q.sourceUrl, q.id).toBe(group.proof.originalUrl);
        expect(q.pdfAssetUrl, q.id).toBe(group.proof.assetUrl);
        expect(q.proofSha256, q.id).toBe(group.proof.sha256);
        expect(q.answerKeySourceUrl, q.id).toBe(group.key.originalUrl);
        expect(q.answerKeySha256, q.id).toBe(group.key.sha256);
      }
      for (const kind of ['proof', 'key', 'keyChanges'] as const) {
        const document = group[kind];
        if (!document) continue;
        const source = sources.find(s => s.id === `${group.id}-${kind}`);
        expect(source, `${group.id}-${kind}`).toMatchObject({ assetUrl: document.assetUrl, url: document.originalUrl, mirrorUrl: document.mirrorUrl, sha256: document.sha256, questionBankDocumentKind: kind });
      }
    }
  });

  it.each(sources)('preserves the SHA-256 and PDF bytes of $id', source => {
    expect(source.assetUrl).toMatch(/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/);
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    const bytes = readFileSync(new URL(`../public${source.assetUrl}`, import.meta.url));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(createHash('sha256').update(bytes).digest('hex'), source.id).toBe(source.sha256);
  });
});

describe('automatic additive availability without fabricated study evidence', () => {
  it('starts with 78 real questions and six isolated demos, without attempts or real scores', () => {
    const app = freshState();
    expect(validateBackup(app)).toBe(true);
    expect(app.demoMode).toBe(false);
    expect(app.questions.filter(q => !q.isDemo)).toHaveLength(78);
    expect(app.questions.filter(q => q.isDemo)).toHaveLength(6);
    expect(app.sessions).toEqual([]);
    expect(app.reviews).toEqual([]);
    expect(app.studyLogs).toEqual([]);
    expect(calculateStats(app, { isDemo: false })).toMatchObject({ attempts: 0, unique: 0, correct: 0, wrong: 0, blank: 0, valid: 0, net: 0, maxPoints: 0, precision: null, errorRate: null, omissionRate: null, netRate: null, meanMs: null, medianMs: null, retention: null, sample: 0 });
  });

  it('adds the real bank to an older demo-only installation without turning demo history into real scores', () => {
    const storage = memoryStorage();
    const previous = freshState();
    previous.questions = previous.questions.filter(q => q.isDemo);
    previous.sources = previous.sources.filter(source => !source.id.startsWith('cebraspe-'));
    previous.demoMode = true;
    const session = createSession(previous, 'learning', [previous.questions[0].id], date);
    session.status = 'completed'; session.completedAt = date;
    Object.assign(session.attempts[0], { initial: previous.questions[0].answer, answer: previous.questions[0].answer, submitted: true, submittedAt: date, confidenceRecorded: true });
    previous.sessions = [session];
    expect(validateBackup(previous)).toBe(true);
    storage.setItem(STORAGE_KEY, JSON.stringify(previous));
    const loaded = loadState();
    expect(loaded.error).toBeNull();
    expect(loaded.state.questions.filter(q => !q.isDemo)).toHaveLength(78);
    expect(loaded.state.sessions).toEqual(previous.sessions);
    expect(loaded.state.demoMode).toBe(true);
    expect(calculateStats(loaded.state, { isDemo: true }).attempts).toBe(1);
    expect(calculateStats(loaded.state, { isDemo: false })).toMatchObject({ attempts: 0, unique: 0, net: 0, precision: null, netRate: null });
  });

  it('migrates additively while preserving local IDs, favorites, corrected keys, attempts, reviews and source notes', () => {
    const storage = memoryStorage();
    const previous = freshState();
    const original = structuredClone(officialQuestionBank.questions[0]);
    const local: Question = { ...original, id: 'pedro-local-import', favorite: true, answer: original.answer === 'C' ? 'E' : 'C', keyVersion: original.keyVersion + 1, keyStatus: 'changed',
      keyHistory: [...original.keyHistory, { version: original.keyVersion + 1, answer: original.answer === 'C' ? 'E' : 'C', status: 'changed', date, source: 'Retificação local preservada para teste de migração' }] };
    previous.questions = [...previous.questions.filter(q => q.isDemo), local];
    previous.sources = previous.sources.filter(source => !source.id.startsWith('cebraspe-'));
    previous.sources[0].detail = 'Minha conferência pessoal da fonte deve permanecer.';
    previous.profile.theme = 'dark';
    const session = createSession(previous, 'learning', [local.id], date);
    session.status = 'completed'; session.completedAt = date;
    Object.assign(session.attempts[0], { initial: original.answer, answer: original.answer, changes: [{ answer: original.answer, at: date }], confidence: 95, confidenceRecorded: true, elapsedMs: 8000, submitted: true, submittedAt: date, keyVersionAtAnswer: original.keyVersion, note: 'Minha resposta e raciocínio anteriores à retificação.' });
    previous.sessions = [session];
    previous.reviews = [{ id: 'pedro-review', questionId: local.id, sessionId: session.id, dueAt: date, stage: 1, reason: 'error', errorType: 'Excesso de confiança', concept: 'Meu conceito corrigido.', note: 'Minha anotação de revisão.', isDemo: false }];
    expect(validateBackup(previous)).toBe(true);
    const snapshot = JSON.stringify(previous);
    storage.setItem(STORAGE_KEY, snapshot); storage.setItem.mockClear();

    const loaded = loadState();
    expect(loaded.error).toBeNull();
    expect(validateBackup(loaded.state)).toBe(true);
    expect(loaded.state.questions.filter(q => !q.isDemo)).toHaveLength(78);
    expect(loaded.state.questions.find(q => q.id === local.id)).toEqual(local);
    expect(loaded.state.questions.some(q => q.id === original.id)).toBe(false);
    expect(new Set(loaded.state.questions.filter(q => !q.isDemo).map(officialQuestionIdentity)).size).toBe(78);
    expect(loaded.state.sessions).toEqual(previous.sessions);
    expect(loaded.state.reviews).toEqual(previous.reviews);
    expect(loaded.state.profile).toEqual(previous.profile);
    expect(loaded.state.sources.find(source => source.id === previous.sources[0].id)).toEqual(previous.sources[0]);
    expect(calculateStats(loaded.state, { isDemo: false })).toEqual(calculateStats(previous, { isDemo: false }));
    expect(calculateStats(loaded.state, { isDemo: false })).toMatchObject({ attempts: 1, unique: 1, correct: 0, wrong: 1, net: -1 });
    expect(storage.getItem(STORAGE_KEY)).toBe(snapshot);
    expect(storage.setItem).not.toHaveBeenCalled();

    storage.setItem(STORAGE_KEY, JSON.stringify(loaded.state));
    const reloaded = loadState();
    expect(reloaded.error).toBeNull();
    expect(reloaded.state).toEqual(loaded.state);
  });
});
