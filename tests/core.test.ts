import { describe, expect, it } from 'vitest';
import { calculateStats, computeSessionStats, createSession, deriveTopicStats, exportCsvRows, getPriority, scheduleReviews } from '../src/core';
import type { AppState, Attempt, BlockRule, Question, Session } from '../src/types';

const block = (id: string, gain = 1, penalty = 1, annulled: BlockRule['annulled'] = 'exclude'): BlockRule => ({ id, name: id, items: null, gain, penalty, omission: 0, minimum: null, annulled });
const date = '2026-10-14T12:00:00.000Z';
function question(id: string, patch: Partial<Question> = {}): Question {
  return { id, statement: `Item ${id}`, board: 'Cebraspe', organization: 'CGU', role: 'TI', year: 2025, discipline: 'Tecnologia', topic: 'Dados', topicId: 'dados', block: 'A', origin: 'official', source: 'Prova pública', answer: 'C', keyStatus: 'final', keyVersion: 1, keyHistory: [], favorite: false, importedAt: date, isDemo: false, ...patch };
}
function state(questions: Question[] = []): AppState {
  return {
    schemaVersion: 1, profile: { name: 'Pedro Lobo', dailyMinutes: 240, daysPerWeek: 6, selfReportedNet: 40, reviewIntervals: [1, 7, 15, 30], targetNet: 70, theme: 'light', reducedDay: false },
    questions, topics: [{ id: 'dados', discipline: 'Tecnologia', name: 'Dados', block: 'A', status: 'not-started', difficulty: 3, verified: false }],
    sessions: [], reviews: [], studyLogs: [], writings: [],
    rules: { version: 'configured-v1', verified: false, specialty: 'A confirmar', sourceUrl: '', sourceName: '', consultedAt: date, blocks: [block('A'), block('B', 3, 2)], totalMinimum: null, durationMinutes: null, dates: [], writingRules: '', notes: '' },
    sources: [], demoMode: false,
  };
}
function session(app: AppState, id: string, answers: [string, Attempt['answer'], number?][], patch: Partial<Session> = {}): Session {
  const base = createSession(app, 'learning', answers.map(([id]) => id), date);
  return { ...base, id, status: 'completed', completedAt: date, attempts: base.attempts.map((attempt, i) => ({ ...attempt, id: `${id}-${attempt.questionId}`, initial: answers[i][1], answer: answers[i][1], confidence: answers[i][2] ?? 75, confidenceRecorded: true, submitted: true, submittedAt: date, presentedAt: date, elapsedMs: (i + 1) * 1000 })), ...patch };
}

describe('scoring and sample integrity', () => {
  it('uses per-block gains, penalty magnitudes, and explicit omissions', () => {
    const app = state([question('a'), question('b', { block: 'B' }), question('c', { block: 'B' })]);
    app.sessions = [session(app, 's', [['a', 'C'], ['b', 'E'], ['c', null]])];
    const stats = calculateStats(app);
    expect(stats).toMatchObject({ attempts: 3, unique: 3, correct: 1, wrong: 1, blank: 1, valid: 2, net: -1, maxPoints: 7, precision: 0.5, errorRate: 0.5, omissionRate: 1 / 3, netRate: -1 / 7, meanMs: 2000, medianMs: 2000 });
  });

  it('treats self-reported net as metadata and zero denominators as unknown', () => {
    const stats = calculateStats(state());
    expect(stats.net).toBe(0);
    expect(stats.attempts).toBe(0);
    for (const metric of ['precision', 'errorRate', 'omissionRate', 'netRate', 'meanMs', 'medianMs', 'retention'] as const) expect(stats[metric]).toBeNull();
  });

  it('does not count answer changes as new attempts and distinguishes repetitions', () => {
    const app = state([question('a')]);
    const first = session(app, 's1', [['a', 'E', 90]]);
    first.attempts[0].changes = [{ answer: 'C', at: date }, { answer: 'E', at: date }];
    const second = session(app, 's2', [['a', 'E', 90]], { startedAt: '2026-10-15T12:00:00Z', completedAt: '2026-10-15T12:00:00Z' });
    second.attempts[0].submittedAt = '2026-10-15T12:00:00Z';
    app.sessions = [first, second];
    expect(calculateStats(app)).toMatchObject({ attempts: 2, unique: 1, wrong: 2, repeatedAttempts: 1, novelAttempts: 1, repeatedErrors: 1, highConfidenceErrors: 2 });
  });

  it('counts blanks only in completed submitted attempts; excludes active and abandoned sessions', () => {
    const app = state([question('a'), question('b')]);
    const finished = session(app, 'finished', [['a', null], ['b', null]]);
    // A premature bulk-finalization flag cannot turn an unseen placeholder into a blank.
    finished.attempts[1].submitted = true;
    finished.attempts[1].presentedAt = '';
    app.sessions = [finished, session(app, 'active', [['a', 'C']], { status: 'active' }), session(app, 'abandoned', [['b', null]], { status: 'abandoned' })];
    expect(calculateStats(app)).toMatchObject({ attempts: 1, blank: 1, unpresented: 1, net: 0, maxPoints: 2, assessedMaxPoints: 1, totalItems: 2, omissionRate: 0.5 });
    expect(computeSessionStats(app, app.sessions[1]).attempts).toBe(0);
  });

  it('keeps demo and real results in separate samples, also at session creation', () => {
    const app = state([question('a'), question('demo', { isDemo: true, origin: 'demo' })]);
    app.sessions = [session(app, 'real', [['a', 'C']])];
    const demoApp = { ...app, demoMode: true };
    app.sessions.push(session(demoApp, 'demo-session', [['demo', 'E']]));
    expect(calculateStats(app)).toMatchObject({ attempts: 1, correct: 1, wrong: 0 });
    expect(calculateStats(app, { isDemo: true })).toMatchObject({ attempts: 1, correct: 0, wrong: 1 });
    expect(createSession(app, 'diagnostic', ['a', 'a', 'demo', 'missing'], date).questionIds).toEqual(['a']);
  });

  it('keeps demonstration scoring functional and provisional when official rules use other blocks', () => {
    const app = state([question('demo', { isDemo: true, origin: 'demo', block: 'general' })]);
    app.demoMode = true;
    app.rules = { ...app.rules, verified: true, blocks: [block('p1', 2, 2)], totalMinimum: 78, durationMinutes: 300 };
    const demo = createSession(app, 'simulation', ['demo'], date);
    expect(demo.rules).toMatchObject({ version: 'demonstracao-v1', verified: false, totalMinimum: null, durationMinutes: null });
    expect(demo.rules.blocks).toEqual([expect.objectContaining({ id: 'general', gain: 1, penalty: 1, omission: 0, minimum: null })]);
    demo.status = 'completed';
    demo.completedAt = date;
    demo.attempts[0] = { ...demo.attempts[0], submitted: true, answer: 'C', initial: 'C', confidenceRecorded: true, submittedAt: date };
    expect(computeSessionStats(app, demo)).toMatchObject({ net: 1, maxPoints: 1, missingRule: 0 });
  });

  it('excludes unknown answer keys from precision and scoring without erasing the attempt', () => {
    const app = state([question('a', { answer: null }), question('b', { answer: null }), question('c')]);
    app.sessions = [session(app, 's', [['a', 'C'], ['b', null], ['c', 'C']])];
    expect(calculateStats(app)).toMatchObject({ attempts: 3, unique: 3, blank: 1, valid: 1, precision: 1, net: 1, maxPoints: 1, excludedUnknownKey: 2 });
  });

  it('supports a configured nonzero omission rule and refuses to invent a missing block rule', () => {
    const app = state([question('a'), question('unknown-block', { block: 'unconfigured' })]);
    app.rules.blocks[0].omission = -0.25;
    app.sessions = [session(app, 's', [['a', null], ['unknown-block', 'C']])];
    expect(calculateStats(app)).toMatchObject({ attempts: 2, correct: 1, blank: 1, net: -0.25, maxPoints: 1, missingRule: 1, scoredAttempts: 1 });
  });

  it('applies annulment exclusion or awarded points without manufacturing correct answers', () => {
    const app = state([question('excluded', { keyStatus: 'annulled' }), question('awarded', { block: 'B', keyStatus: 'annulled', answer: null })]);
    app.rules.blocks[1].annulled = 'award';
    app.sessions = [session(app, 's', [['excluded', 'C'], ['awarded', null]])];
    expect(calculateStats(app)).toMatchObject({ attempts: 2, correct: 0, wrong: 0, valid: 0, precision: null, net: 3, maxPoints: 3, netRate: 1, excludedAnnulled: 1, awarded: 1 });
  });

  it('uses immutable scoring snapshots while recalculating a changed official answer key', () => {
    const app = state([question('a')]);
    const original = session(app, 's', [['a', 'C']]);
    app.sessions = [original];
    app.rules.blocks[0].gain = 20;
    app.rules.blocks[0].penalty = 10;
    app.rules.version = 'new-rules';
    expect(calculateStats(app).net).toBe(1);
    app.questions[0] = { ...app.questions[0], answer: 'E', keyStatus: 'changed', keyVersion: 2 };
    expect(calculateStats(app)).toMatchObject({ correct: 0, wrong: 1, net: -1, maxPoints: 1, ruleVersions: ['configured-v1'], keyVersions: { a: 2 } });
    expect(original.attempts[0]).toMatchObject({ answer: 'C', keyVersionAtAnswer: 1 });
    expect(original.rules.blocks[0].gain).toBe(1);
  });

  it('keeps post-omission diagnostic responses outside the original score', () => {
    const app = state([question('a')]);
    const s = session(app, 's', [['a', null]]);
    s.attempts[0].diagnosticAnswer = 'C';
    app.sessions = [s];
    expect(calculateStats(app)).toMatchObject({ blank: 1, valid: 0, correct: 0, net: 0, maxPoints: 1 });
  });

  it('uses the full selected weighted maximum for a partial closed simulation without inventing blanks', () => {
    const app = state(Array.from({ length: 170 }, (_, index) => question(`q${index}`, { block: index < 80 ? 'A' : 'B' })));
    app.rules.blocks[1] = block('B', 2, 2);
    const s = createSession(app, 'simulation', app.questions.map(q => q.id), date);
    s.status = 'completed'; s.completedAt = date;
    s.attempts[0] = { ...s.attempts[0], answer: 'C', initial: 'C', submitted: true, submittedAt: date, confidenceRecorded: true };
    app.sessions = [s];
    expect(calculateStats(app)).toMatchObject({ attempts: 1, unique: 1, correct: 1, blank: 0, unpresented: 169, totalItems: 170, maxPoints: 260, net: 1, netRate: 1 / 260, assessedMaxPoints: 1, assessedNet: 1, assessedNetRate: 1, omissionRate: 0 });
  });

  it('awards annulled selected items even if unseen while preserving the original attempts', () => {
    const app = state([question('a'), question('annulled', { block: 'B', keyStatus: 'annulled', answer: null })]);
    app.rules.blocks[1] = block('B', 2, 2, 'award');
    const s = createSession(app, 'simulation', ['a', 'annulled'], date);
    s.status = 'completed'; s.completedAt = date;
    s.attempts[0] = { ...s.attempts[0], answer: 'C', initial: 'C', submitted: true, submittedAt: date, confidenceRecorded: true };
    app.sessions = [s];
    expect(computeSessionStats(app, s)).toMatchObject({ attempts: 1, correct: 1, blank: 0, awarded: 1, awardedUnpresented: 1, net: 3, maxPoints: 3, assessedNet: 1, assessedMaxPoints: 1 });
    expect(s.attempts[1]).toMatchObject({ submitted: false, answer: null, presentedAt: '' });
  });

  it('recognizes earlier submitted exposure in an abandoned session without adding its score', () => {
    const app = state([question('a')]);
    const exposed = session(app, 'exposed', [['a', 'E']], { status: 'abandoned', completedAt: '2026-10-13T12:00:00Z' });
    exposed.attempts[0].submittedAt = '2026-10-13T12:00:00Z';
    const completed = session(app, 'completed', [['a', 'C']], { mode: 'review' });
    app.sessions = [exposed, completed];
    expect(calculateStats(app)).toMatchObject({ attempts: 1, correct: 1, wrong: 0, net: 1, novelAttempts: 0, repeatedAttempts: 1, retention: 1, reviewSample: 1 });
  });

  it('anchors date filters to session completion for consistent numerator and selected maximum', () => {
    const app = state([question('a'), question('b')]);
    const s = session(app, 'overnight', [['a', 'C'], ['b', null]]);
    s.attempts[0].submittedAt = '2026-10-13T23:30:00Z';
    app.sessions = [s];
    expect(calculateStats(app, { from: '2026-10-14', to: '2026-10-14' })).toMatchObject({ attempts: 2, net: 1, maxPoints: 2, netRate: 0.5, totalItems: 2 });
    expect(calculateStats(app, { to: '2026-10-13' }).attempts).toBe(0);
  });

  it('filters periods inclusively and preserves global novelty outside that period', () => {
    const app = state([question('a'), question('b', { discipline: 'Redes', topic: 'Protocolos', block: 'B', source: 'Outro' })]);
    const old = session(app, 'old', [['a', 'E']], { completedAt: '2026-10-01T12:00:00Z' });
    old.attempts[0].submittedAt = '2026-10-01T12:00:00Z';
    const current = session(app, 'current', [['a', 'C'], ['b', 'E']], { mode: 'review' });
    app.sessions = [old, current];
    const filtered = calculateStats(app, { from: '2026-10-14', to: '2026-10-14', discipline: 'Tecnologia', topic: 'dados', block: 'A', source: 'Prova pública', mode: 'review' });
    expect(filtered).toMatchObject({ attempts: 1, correct: 1, novelAttempts: 0, repeatedAttempts: 1, retention: 1, reviewSample: 1 });
    expect(calculateStats(app, { source: 'does not exist' }).attempts).toBe(0);
  });

  it('survives serialization and resumes a session with all response evidence intact', () => {
    const app = state([question('a')]);
    const s = session(app, 's', [['a', 'C']]);
    s.attempts[0].note = 'Conferir premissa';
    s.attempts[0].changes = [{ answer: 'C', at: date }];
    app.sessions = [s];
    const restored = JSON.parse(JSON.stringify(app)) as AppState;
    expect(calculateStats(restored)).toEqual(calculateStats(app));
    expect(restored.sessions[0].attempts[0].note).toBe('Conferir premissa');
  });

  it('reports calibration sample, helped/harmed changes, and median time correctly', () => {
    const app = state([question('a'), question('b'), question('c'), question('d')]);
    const s = session(app, 's', [['a', 'C', 90], ['b', 'E', 90], ['c', 'C', 20], ['d', null, 50]]);
    s.attempts[0].initial = 'E'; s.attempts[0].changes = [{ answer: 'C', at: date }];
    s.attempts[1].initial = 'C'; s.attempts[1].changes = [{ answer: 'E', at: date }];
    app.sessions = [s];
    const stats = calculateStats(app);
    expect(stats).toMatchObject({ initialChangesHelped: 1, initialChangesHurt: 1, medianMs: 2500, noGainMs: 6000 });
    expect(stats.confidenceBands[3]).toMatchObject({ attempts: 2, correct: 1, accuracy: 0.5 });
    expect(stats.confidenceBands[1].accuracy).toBeNull();
  });

  it('does not turn an unrecorded timeout confidence placeholder into calibrated evidence', () => {
    const app = state([question('a')]);
    const s = session(app, 'timeout', [['a', 'E', 90]], { mode: 'simulation' });
    s.attempts[0].confidenceRecorded = false;
    app.sessions = [s];
    const stats = calculateStats(app);
    expect(stats).toMatchObject({ wrong: 1, highConfidenceErrors: 0, unrecordedConfidence: 1 });
    expect(stats.confidenceBands.reduce((sum, band) => sum + band.attempts, 0)).toBe(0);
    expect(scheduleReviews(app, s)[0].errorType).toBe('Falta de conhecimento');
  });
});

describe('review scheduling and mastery evidence', () => {
  it('uses verified block gain as official weight without inventing topic incidence', () => {
    const app = state();
    app.rules.verified = true;
    app.rules.blocks[1] = block('B', 2, 2);
    const topicA = app.topics[0];
    const topicB = { ...topicA, id: 'weighted', block: 'B' };
    app.topics.push(topicB);
    const low = getPriority(app, topicA);
    const high = getPriority(app, topicB);
    expect(high.priority).toBeGreaterThan(low.priority);
    expect(high.reasons.join(' ')).toContain('vale 2 ponto(s)');
    expect(high.reasons.join(' ')).toContain('sem presumir incidência');
  });

  it('does not declare an elimination result while an official key is unresolved', () => {
    const app = state([question('unknown', { answer: null }), question('known')]);
    app.rules.verified = true;
    app.rules.blocks[0].items = 2;
    app.rules.blocks[0].minimum = 2;
    app.sessions = [session(app, 'simulation', [['unknown', 'C'], ['known', 'C']], { mode: 'simulation' })];
    expect(getPriority(app, 'dados').reasons.join(' ')).not.toContain('abaixo do mínimo de');
    app.questions[0].answer = 'E';
    expect(getPriority(app, 'dados').reasons.join(' ')).toContain('abaixo do mínimo de');
  });
  it('schedules mistakes and uncertain correct answers, avoids duplicate scheduling', () => {
    const app = state([question('a'), question('b'), question('c'), question('d')]);
    const s = session(app, 's', [['a', 'E', 90], ['b', 'C', 40], ['c', 'C', 90], ['d', null]]);
    s.attempts[3].marked = true;
    const reviews = scheduleReviews(app, s);
    expect(reviews.map(review => review.reason)).toEqual(['error', 'uncertain', 'marked']);
    expect(reviews[0]).toMatchObject({ dueAt: '2026-10-15T12:00:00.000Z', stage: 0, errorType: 'Excesso de confiança', isDemo: false });
    app.reviews = reviews;
    expect(scheduleReviews(app, s)).toEqual([]);
    expect(scheduleReviews(app, { ...s, status: 'active' })).toEqual([]);
  });

  it('advances a confident successful review and resets the stage after a new error', () => {
    const app = state([question('a')]);
    const first = session(app, 'first', [['a', 'E']]);
    app.reviews = scheduleReviews(app, first);
    const second = session(app, 'second', [['a', 'C', 90]], { mode: 'review' });
    const next = scheduleReviews(app, second);
    expect(next[0]).toMatchObject({ stage: 1, dueAt: '2026-10-21T12:00:00.000Z' });
    app.reviews.push(next[0]);
    const third = session(app, 'third', [['a', 'E']], { mode: 'review' });
    expect(scheduleReviews(app, third)[0].stage).toBe(0);
  });

  it('does not consolidate a topic because of a few correct answers or many repeats of one question', () => {
    const app = state([question('a')]);
    app.sessions = Array.from({ length: 30 }, (_, index) => session(app, `s${index}`, [['a', 'C', 90]], { mode: index ? 'review' : 'learning' }));
    expect(deriveTopicStats(app, 'dados')).toMatchObject({ unique: 1, attempts: 30, canConsolidate: false });
    expect(getPriority(app, 'dados').evidence.join(' ')).toContain('1 questões únicas');
  });

  it('allows consolidation only with unique coverage plus judged later retention', () => {
    const app = state(Array.from({ length: 20 }, (_, index) => question(`q${index}`)));
    const first = session(app, 'initial', app.questions.map(q => [q.id, 'C', 90]));
    const later = session(app, 'later', app.questions.slice(0, 5).map(q => [q.id, 'C', 90]), { mode: 'review', completedAt: '2026-10-15T12:00:00Z' });
    later.attempts.forEach(attempt => { attempt.submittedAt = '2026-10-15T12:00:00Z'; });
    app.sessions = [first, later];
    expect(deriveTopicStats(app, 'dados')).toMatchObject({ uniqueValid: 20, reviewSample: 5, retention: 1, canConsolidate: true, status: 'consolidated' });
  });

  it('requires sufficient weighted net even when high precision and retention look strong', () => {
    const app = state(Array.from({ length: 20 }, (_, index) => question(`q${index}`, index === 19 ? { block: 'B' } : {})));
    app.rules.blocks[1].gain = 100;
    app.rules.blocks[1].penalty = 100;
    const first = session(app, 'initial', app.questions.map((q, index) => [q.id, index === 19 ? 'E' : 'C', 90]));
    const later = session(app, 'later', app.questions.slice(0, 5).map(q => [q.id, 'C', 90]), { mode: 'review', completedAt: '2026-10-15T12:00:00Z' });
    later.attempts.forEach(attempt => { attempt.submittedAt = '2026-10-15T12:00:00Z'; });
    app.sessions = [first, later];
    const topic = deriveTopicStats(app, 'dados');
    expect(topic.precision).toBe(0.96);
    expect(topic.retention).toBe(1);
    expect(topic.netRate).toBeLessThan(0);
    expect(topic.canConsolidate).toBe(false);
    expect(topic.evidence.join(' ')).toContain('Aproveitamento líquido');
  });
});

describe('CSV exports', () => {
  it('preserves accents, multiline text, double quotes and protects spreadsheet formulas', () => {
    const csv = exportCsvRows([{ Tópico: 'função; "SQL"\nlinha', Nota: -2, Anotação: '  =HYPERLINK("https://example.org")' }, { Tópico: '@SUM(A1)', Nota: null, Anotação: '+1' }]);
    expect(csv).toContain('"função; ""SQL""\nlinha"');
    expect(csv).toContain('"-2"');
    expect(csv).toContain('"\'  =HYPERLINK(""https://example.org"")"');
    expect(csv).toContain('"\'@SUM(A1)"');
    expect(csv).toContain('"\'+1"');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
});
