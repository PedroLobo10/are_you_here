import { describe, expect, it } from 'vitest';
import { calculateStats, createSession } from '../src/core';
import { mergeQuestionBank, validateQuestionBank } from '../src/question-bank';
import type { QuestionBank } from '../src/question-bank';
import { freshState, validateBackup } from '../src/storage';
import type { AppState, Question, SourceRecord } from '../src/types';

const date = '2026-10-15T12:00:00.000Z';
function state(): AppState { const app = freshState(); app.questions = []; return app; }
function question(id = 'source-item-1', patch: Partial<Question> = {}): Question {
  const topic = freshState().topics[0];
  return { id, statement: 'Enunciado de teste da instalação.', board: 'Cebraspe', organization: 'Órgão de teste', role: 'Cargo de teste', year: 2025,
    discipline: topic.discipline, topic: topic.name, topicId: topic.id, block: topic.block,
    origin: 'official', source: 'Caderno público e gabarito definitivo de teste', sourceUrl: 'https://www.cebraspe.org.br/teste/prova.pdf',
    examId: 'test-exam-2025', itemNumber: '1', answer: 'C', keyStatus: 'final', keyVersion: 1,
    keyHistory: [{ version: 1, answer: 'C', status: 'final', date, source: 'https://www.cebraspe.org.br/teste/gabarito.pdf' }],
    importedAt: date, isDemo: false, favorite: false, ...patch };
}
function bank(questions: Question[] = [question()], patch: Partial<QuestionBank> = {}): QuestionBank {
  return { id: 'test-bank', version: 'v1', title: 'Pacote de teste', description: 'Dados restritos a testes automatizados.', consultedAt: date, questions, ...patch };
}
function validate(input: unknown) { const app = state(); return validateQuestionBank(input, app.topics, app.rules); }

describe('official question-bank validation', () => {
  it('accepts a mapped official item and preserves optional document provenance', () => {
    const input = bank();
    const provenance = { examPdf: 'https://www.cebraspe.org.br/teste/prova.pdf', examSha256: 'test-checksum', page: 2 };
    Object.assign(input.questions[0], { provenance });
    const result = validate(input);
    expect(result.errors).toEqual([]);
    expect(result.bank?.questions).toHaveLength(1);
    expect(result.bank?.questions[0]).toHaveProperty('provenance', provenance);
    expect(validateBackup(mergeQuestionBank(state(), result.bank!).state)).toBe(true);
  });

  it.each([
    ['another board', { board: 'FGV' }],
    ['an author-created item', { origin: 'demo', isDemo: true }],
    ['missing exam year', { year: null }],
    ['unsafe URL', { sourceUrl: 'javascript:alert(1)' }],
    ['credential-bearing URL', { sourceUrl: 'https://secret:token@example.org/prova.pdf' }],
    ['missing source', { source: '' }],
    ['missing key provenance', { keyHistory: [] }],
    ['inconsistent current key', { answer: 'E' }],
    ['unlinked topic', { topicId: 'unknown-topic' }],
    ['mismatched subject', { discipline: 'Outra disciplina' }],
    ['mismatched topic', { topic: 'Outro assunto' }],
    ['mismatched block', { block: 'unknown-block' }],
    ['unexplained difficulty', { difficulty: 'Difícil' }],
    ['invalid optional identity', { examId: { bad: true } }],
    ['invalid PDF page', { pdfPage: -1 }],
  ])('rejects %s without installing a partial package', (_label, patch) => {
    const result = validate(bank([question(), question('bad-item', { itemNumber: '2', ...patch } as Partial<Question>)]));
    expect(result.bank).toBeNull(); expect(result.errors.length).toBeGreaterThan(0);
  });

  it('keeps AI comments unvalidated and separate from the official key', () => {
    const result = validate(bank([question('with-ai', { explanation: { direct: 'Comentário automático de teste.', steps: [], author: 'ai', validated: true, reference: 'https://www.example.org/reference' } })]));
    expect(result.errors).toEqual([]);
    expect(result.bank?.questions[0].explanation?.validated).toBe(false);
    expect(result.bank?.questions[0].answer).toBe('C');
    expect(result.warnings).toHaveLength(1);
  });

  it('deduplicates both stable IDs and the original exam/item', () => {
    const a = question();
    const result = validate(bank([a, structuredClone(a), { ...a, id: 'another-local-id' }]));
    expect(result.errors).toEqual([]);
    expect(result.bank?.questions).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });

  it('rejects a conflicting duplicate instead of silently picking a key', () => {
    const second = question('same-original-other-id', { answer: 'E', keyHistory: [{ version: 1, answer: 'E', status: 'final', date, source: 'Outra fonte' }] });
    expect(validate(bank([question(), second])).errors.some(error => error.includes('duplicata conflitante'))).toBe(true);
  });

  it('validates annulled items against their versioned null key', () => {
    const annulled = question('annulled', { answer: null, keyStatus: 'annulled', keyHistory: [{ version: 1, answer: null, status: 'annulled', date, source: 'Anulação oficial de teste' }] });
    expect(validate(bank([annulled])).errors).toEqual([]);
    expect(validate(bank([{ ...annulled, answer: 'C' }])).bank).toBeNull();
  });
});

describe('additive question-bank installation', () => {
  it('adds sources and questions without producing sessions, attempts, reviews or fake metrics', () => {
    const app = state();
    const result = mergeQuestionBank(app, bank());
    expect(result.added).toBe(1); expect(result.existing).toBe(0); expect(result.conflicts).toEqual([]);
    expect(result.state.sessions).toBe(app.sessions);
    expect(result.state.reviews).toBe(app.reviews);
    expect(result.state.studyLogs).toBe(app.studyLogs);
    expect(result.state.profile).toBe(app.profile);
    expect(result.state.rules).toBe(app.rules);
    expect(result.state.writings).toBe(app.writings);
    expect(result.state.topics).toBe(app.topics);
    expect(calculateStats(result.state)).toMatchObject({ attempts: 0, unique: 0, precision: null, netRate: null });
    expect(app.questions).toHaveLength(0);
  });

  it('does not duplicate an installed exam when a package is installed twice', () => {
    const first = mergeQuestionBank(state(), bank());
    const second = mergeQuestionBank(first.state, bank());
    expect(second).toMatchObject({ added: 0, existing: 1, conflicts: [] });
    expect(second.state).toBe(first.state);
    expect(second.state.questions).toHaveLength(1);
  });

  it('preserves local IDs, favorites, answer histories, notes and review records', () => {
    const app = state();
    const local = question('my-local-item', { favorite: true });
    app.questions = [local];
    app.sessions = [createSession(app, 'learning', [local.id], date)];
    app.sessions[0].attempts[0].note = 'Minha anotação pessoal';
    app.reviews = [{ id: 'review', questionId: local.id, sessionId: app.sessions[0].id, dueAt: date, stage: 0, reason: 'uncertain', errorType: 'Chute', concept: 'Conceito', note: 'Anotação de revisão', isDemo: false }];
    const result = mergeQuestionBank(app, bank([question()]));
    expect(result).toMatchObject({ added: 0, existing: 1 });
    expect(result.state.questions[0]).toBe(local);
    expect(result.state.questions[0].favorite).toBe(true);
    expect(result.state.sessions).toBe(app.sessions);
    expect(result.state.reviews).toBe(app.reviews);
    expect(result.state.sessions[0].attempts[0].note).toBe('Minha anotação pessoal');
  });

  it('preserves a locally corrected newer key and still installs other new items', () => {
    const app = state();
    const local = question('original-local-id', { answer: 'E', keyStatus: 'changed', keyVersion: 2, favorite: true,
      keyHistory: [...question().keyHistory, { version: 2, answer: 'E', status: 'changed', date, source: 'Retificação oficial posterior' }] });
    app.questions = [local];
    const result = mergeQuestionBank(app, bank([question(), question('new-item', { itemNumber: '2' })]));
    expect(result).toMatchObject({ added: 1, existing: 1 });
    expect(result.conflicts).toHaveLength(1);
    expect(result.state.questions[0]).toBe(local);
    expect(result.state.questions[0].keyHistory).toHaveLength(2);
    expect(result.state.questions[0].answer).toBe('E');
    expect(result.state.questions[0].keyVersion).toBe(2);
  });

  it('recognizes a manually imported original by its source URL/item when it lacks an exam ID', () => {
    const app = state(); app.questions = [question('manual-id', { examId: undefined })];
    const result = mergeQuestionBank(app, bank());
    expect(result).toMatchObject({ added: 0, existing: 1 });
    expect(result.state.questions[0].id).toBe('manual-id');
  });

  it('never overwrites existing source documentation', () => {
    const source: SourceRecord = { id: 'proof', title: 'Fonte existente', url: 'https://www.cebraspe.org.br/teste', consultedAt: date, status: 'verified', detail: 'Documentação conferida localmente.' };
    const app = state(); app.sources.push(source);
    const result = mergeQuestionBank(app, bank([question()], { sources: [{ ...source, detail: 'Outra documentação.' }] }));
    expect(result.state.sources.find(s => s.id === source.id)).toBe(source);
  });

  it('rejects invalid packages atomically without mutating the existing state', () => {
    const app = state();
    const result = mergeQuestionBank(app, bank([question(), question('invalid', { board: 'FGV' })]));
    expect(result.state).toBe(app); expect(result.added).toBe(0);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});
