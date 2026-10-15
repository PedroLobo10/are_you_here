import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateStats, createSession } from '../src/core';
import { officialQuestionIdentity, validateQuestionBank } from '../src/question-bank';
import { officialQuestionBank } from '../src/source-data';
import { freshState, loadState, STORAGE_KEY, validateBackup } from '../src/storage';
import type { Question, SourceRecord } from '../src/types';
import legacyIds from './fixtures/legacy-v1-question-ids.json';

type DocumentKind = 'proof' | 'key' | 'keyChanges';
type PreservedDocument = { assetUrl?: string; originalUrl: string; mirrorUrl: string; sha256?: string; format?: string; reportedOriginalSha256?: string; pages?: { assetUrl: string; page:number; sha256:string }[]; items?: {item:number;answer:string}[] };
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
const allSources = officialQuestionBank.sources!;
const sources = allSources.filter(source => source.assetUrl) as BankSource[];
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

  it('contains 315 unique official previous-exam items, with no author-created or demonstration question', () => {
    expect(officialQuestionBank.questions).toHaveLength(315);
    expect(new Set(officialQuestionBank.questions.map(q => q.id)).size).toBe(315);
    expect(new Set(officialQuestionBank.questions.map(officialQuestionIdentity)).size).toBe(315);
    for (const q of officialQuestionBank.questions) {
      expect(q.board, q.id).toBe('Cebraspe');
      expect(q.origin, q.id).toBe('official');
      expect(q.isDemo, q.id).toBe(false);
      expect(q.year, q.id).toBeGreaterThanOrEqual(2018);
      expect(q.year, q.id).toBeLessThanOrEqual(2026);
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
    expect(result.bank?.questions).toHaveLength(315);
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
    expect(manifest.provenance).toHaveLength(26);
    expect(allSources).toHaveLength(53);
    expect(sources).toHaveLength(15);
    expect(new Set(sources.map(source => source.assetUrl)).size).toBe(15);
    expect(manifest.provenance.reduce((sum, group) => sum + group.questionCount, 0)).toBe(315);
    for (const group of manifest.provenance) {
      const questions = (officialQuestionBank.questions as ProvenancedQuestion[]).filter(q => q.sourceId === group.id);
      expect(questions, group.id).toHaveLength(group.questionCount);
      expect(questions.map(q => Number(q.itemNumber)).sort((a, b) => a - b), group.id).toEqual([...group.questionNumbers].sort((a, b) => a - b));
      for (const q of questions) {
        expect(q.sourceUrl, q.id).toBe(group.proof.originalUrl);
        expect(q.pdfAssetUrl, q.id).toBe(group.proof.assetUrl);
        expect(q.proofSha256, q.id).toBe(group.proof.sha256 ?? group.proof.reportedOriginalSha256);
        expect(q.answerKeySourceUrl, q.id).toBe(group.key.originalUrl);
        if (group.key.format === 'public-json-transcription') {
          expect(q.keyVerification).toBe('public-transcription');
          expect(group.key.items?.find(item => item.item === Number(q.itemNumber))?.answer).toBe(q.answer);
          expect(allSources.find(source => source.id === `${group.id}-key`)?.status).toBe('unavailable');
          expect(q.originalPages?.length).toBeGreaterThan(0);
        } else expect(q.answerKeySha256, q.id).toBe(group.key.sha256);
      }
      for (const kind of ['proof', 'key', 'keyChanges'] as const) {
        const document = group[kind];
        if (!document) continue;
        const source = allSources.find(s => s.id === `${group.id}-${kind}`);
        expect(source, `${group.id}-${kind}`).toMatchObject({ url: document.originalUrl, mirrorUrl: document.mirrorUrl, questionBankDocumentKind: kind });
        if (document.assetUrl) expect(source).toMatchObject({ assetUrl: document.assetUrl, sha256: document.sha256 });
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
  it('starts with 315 real questions and six isolated demos, without attempts or real scores', () => {
    const app = freshState();
    expect(validateBackup(app)).toBe(true);
    expect(app.demoMode).toBe(false);
    expect(app.questions.filter(q => !q.isDemo)).toHaveLength(315);
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
    expect(loaded.state.questions.filter(q => !q.isDemo)).toHaveLength(315);
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
    expect(loaded.state.questions.filter(q => !q.isDemo)).toHaveLength(315);
    expect(loaded.state.questions.find(q => q.id === local.id)).toEqual(local);
    expect(loaded.state.questions.some(q => q.id === original.id)).toBe(false);
    expect(new Set(loaded.state.questions.filter(q => !q.isDemo).map(officialQuestionIdentity)).size).toBe(315);
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

describe('recent expansion with transparent source evidence', () => {
  it('keeps all 78 original IDs and adds 237 recent questions, with new items in every discipline', () => {
    const ids = new Set(officialQuestionBank.questions.map(q => q.id));
    expect(legacyIds).toHaveLength(78);for (const id of legacyIds) expect(ids.has(id), id).toBe(true);
    const added = officialQuestionBank.questions.filter(q => !legacyIds.includes(q.id));
    expect(added).toHaveLength(237);
    expect(added.filter(q => q.year === 2026)).toHaveLength(16);
    expect(added.filter(q => q.year === 2025)).toHaveLength(201);
    expect(added.filter(q => q.year === 2024)).toHaveLength(20);
    for (const discipline of new Set(freshState().topics.map(topic => topic.discipline))) {
      expect(added.some(q => q.discipline === discipline), discipline).toBe(true);
    }
    expect(new Set(officialQuestionBank.questions.map(q => q.topicId)).size).toBe(94);
    expect(officialQuestionBank.questions.filter(q => q.discipline.includes('AUDITORIA GOVERNAMENTAL'))).toHaveLength(4);
  });

  it('preserves 221 catalog records with exact keys, booklet codes, years and C/E format', () => {
    const selection = JSON.parse(readFileSync(new URL('../public/question-banks/cebraspe-recent-catalog-selection.json', import.meta.url), 'utf8'));
    expect(selection.records).toHaveLength(221);
    for (const entry of selection.records) {
      const q = officialQuestionBank.questions.find(q => q.id === entry.questionId)!;
      const raw = entry.originalRecord;
      expect(q, entry.questionId).toBeDefined();
      expect(raw.origin).toBe('oficial');expect(raw.format).toBe('certo-errado');expect(raw.annulled).toBe(false);
      expect(raw.alternatives.map((option: {letter: string}) => option.letter).sort()).toEqual(['C', 'E']);
      expect(q.answer).toBe(raw.correctAlternative);expect(q.year).toBe(raw.year);expect(q.itemNumber).toBe(String(raw.index));
      expect(q.sourceUrl).toBe(raw.sourceUrl);expect(q.examId).toContain(raw.paperCode);
      expect(q.keyVerification).toBe('public-transcription');expect(q.sourceVerification).toContain('PDF do gabarito não foi obtido');
      expect(q.answerKeyEvidenceUrl).toContain(selection.commit);expect(q.keyHistory[0].source).toContain(raw.answerKeyUrl);
      expect(q.explanation).toBeUndefined();expect(q.statement).not.toMatch(/[\x00-\x08\x0b\x0e-\x1f]/);
      expect(q.originalPages?.some(page => page.page === raw.sourcePage && !page.support)).toBe(true);
    }
  });

  it('validates all 38 preserved raster pages against their individual SHA-256', () => {
    const pages = new Map(officialQuestionBank.questions.flatMap(q => q.originalPages ?? []).map(page => [page.assetUrl, page]));
    expect(pages.size).toBe(38);
    for (const page of pages.values()) {
      const bytes = readFileSync(new URL(`../public${page.assetUrl}`, import.meta.url));
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF');expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(page.sha256);
    }
  });

  it('keeps the independently checked 2026 PDF answer keys and historical census context', () => {
    const expected: Record<string,string> = {99:'E',100:'C',106:'C',107:'C',108:'C',111:'C',112:'E',113:'E',114:'E',115:'C',118:'E',119:'C',120:'C',216:'E',217:'C',218:'C'};
    const items = officialQuestionBank.questions.filter(q => q.year === 2026);
    expect(items).toHaveLength(16);
    for (const q of items) { expect(q.answer, q.id).toBe(expected[q.itemNumber!]);expect(q.keyVerification).toBe('pdf-checked');expect(q.yearBasis).toBe('application');expect(q.pdfAssetUrl).toBeTruthy(); }
    expect(items.find(q => q.itemNumber === '106')).toMatchObject({ contentCurrentness:'historical-statistic' });
    expect(items.find(q => q.itemNumber === '106')?.statement).toContain('Censo Agropecuário de 2017');
  });

  it('migrates a v1 installation with 78 questions to 315 without changing existing favorites or scores', () => {
    const storage = memoryStorage();const previous = freshState();
    previous.questions = previous.questions.filter(q => q.isDemo || legacyIds.includes(q.id));
    previous.sources = previous.sources.filter(source => !source.id.startsWith('cebraspe-recent-') && !source.id.startsWith('cebraspe-irbr-'));
    previous.questions.find(q => legacyIds.includes(q.id))!.favorite = true;
    const snapshot = structuredClone(previous.questions);
    storage.setItem(STORAGE_KEY, JSON.stringify(previous));
    const loaded = loadState();expect(loaded.error).toBeNull();expect(loaded.state.questions.filter(q => !q.isDemo)).toHaveLength(315);
    for (const q of snapshot) expect(loaded.state.questions.find(candidate => candidate.id === q.id)).toEqual(q);
    expect(calculateStats(loaded.state)).toMatchObject({attempts:0,unique:0,net:0,precision:null});
  });

  it('has enough distinct mapped items for all official objective blocks without inventing a session', () => {
    const app = freshState();const real = app.questions.filter(q => !q.isDemo);const selected: Question[] = [];
    for (const block of app.rules.blocks) {
      const pool = real.filter(q => q.block === block.id);expect(pool.length).toBeGreaterThanOrEqual(block.items!);selected.push(...pool.slice(0,block.items!));
    }
    expect(selected).toHaveLength(170);expect(new Set(selected.map(q => q.id)).size).toBe(170);expect(app.sessions).toEqual([]);
    expect(selected.reduce((sum,q) => sum+app.rules.blocks.find(block => block.id === q.block)!.gain,0)).toBe(260);
  });
});
