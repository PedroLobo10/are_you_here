import type { AppState, Attempt, BlockRule, Mode, Question, Review, Session, Topic } from './types';

export interface StatsFilter {
  isDemo?: boolean;
  from?: string;
  to?: string;
  discipline?: string;
  topic?: string;
  block?: string;
  source?: string;
  mode?: string;
}

export interface ConfidenceBand {
  from: number;
  to: number;
  label: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface Stats {
  /** Submitted items in completed sessions, including explicit omissions. */
  attempts: number;
  unique: number;
  correct: number;
  wrong: number;
  blank: number;
  valid: number;
  precision: number | null;
  errorRate: number | null;
  omissionRate: number | null;
  net: number;
  maxPoints: number;
  netRate: number | null;
  totalItems: number;
  scoredItems: number;
  assessedNet: number;
  assessedMaxPoints: number;
  assessedNetRate: number | null;
  meanMs: number | null;
  medianMs: number | null;
  highConfidenceErrors: number;
  unrecordedConfidence: number;
  repeatedErrors: number;
  retention: number | null;
  sample: number;
  sessionIds: string[];
  scoredAttempts: number;
  excludedUnknownKey: number;
  excludedAnnulled: number;
  missingRule: number;
  awarded: number;
  awardedUnpresented: number;
  unpresented: number;
  uniqueValid: number;
  reviewSample: number;
  novelAttempts: number;
  repeatedAttempts: number;
  novelPrecision: number | null;
  repeatedPrecision: number | null;
  novelNetRate: number | null;
  repeatedNetRate: number | null;
  confidenceBands: ConfidenceBand[];
  initialChangesHelped: number;
  initialChangesHurt: number;
  noGainMs: number;
  ruleVersions: string[];
  keyVersions: Record<string, number>;
}

interface Row {
  attempt: Attempt;
  question: Question;
  session: Session;
  rule?: BlockRule;
  time: string;
}

const divide = (numerator: number, denominator: number): number | null => denominator > 0 ? numerator / denominator : null;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const confidence = (value: number) => Math.max(0, Math.min(100, finite(value, 50)));
const hasConfidence = (attempt: Attempt) => attempt.confidenceRecorded !== false;
const milliseconds = (attempt: Attempt) => Math.max(0, finite(attempt.elapsedMs));
const isValidAnswer = (answer: unknown): answer is 'C' | 'E' => answer === 'C' || answer === 'E';
const rowTime = (attempt: Attempt, session: Session) => attempt.submittedAt || session.completedAt || session.startedAt;
const compareRows = (a: Row, b: Row) => a.time.localeCompare(b.time) || a.session.startedAt.localeCompare(b.session.startedAt) || a.attempt.id.localeCompare(b.attempt.id);

function matchesTopic(state: AppState, question: Question, topic: string): boolean {
  if (question.topicId === topic || question.topic === topic) return true;
  const definition = state.topics.find(candidate => candidate.id === topic);
  return Boolean(definition && question.discipline === definition.discipline && question.topic === definition.name && (!definition.subtopic || question.subtopic === definition.subtopic));
}

function questionMatches(state: AppState, question: Question, filter: StatsFilter): boolean {
  return (!filter.discipline || question.discipline === filter.discipline)
    && (!filter.topic || matchesTopic(state, question, filter.topic))
    && (!filter.block || question.block === filter.block)
    && (!filter.source || question.source === filter.source || question.examId === filter.source);
}

function allRows(state: AppState, isDemo: boolean, sessions = state.sessions, includeIncomplete = false): Row[] {
  const questions = new Map(state.questions.map(question => [question.id, question]));
  const rows: Row[] = [];
  for (const session of sessions) {
    if ((!includeIncomplete && session.status !== 'completed') || session.isDemo !== isDemo) continue;
    // One submitted response per item in a session. Answer changes remain inside it.
    const submitted = new Map<string, Attempt>();
    for (const attempt of session.attempts) {
      if (!attempt.submitted || !attempt.presentedAt || !session.questionIds.includes(attempt.questionId)) continue;
      const prior = submitted.get(attempt.questionId);
      if (!prior || rowTime(attempt, session) >= rowTime(prior, session)) submitted.set(attempt.questionId, attempt);
    }
    for (const attempt of submitted.values()) {
      const question = questions.get(attempt.questionId);
      if (!question || question.isDemo !== isDemo) continue;
      rows.push({ attempt, question, session, rule: session.rules.blocks.find(block => block.id === question.block), time: rowTime(attempt, session) });
    }
  }
  return rows.sort(compareRows);
}

function dateBoundary(value: string | undefined, end: boolean): number | null {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : value;
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function validForAccuracy(row: Row): boolean {
  return row.question.keyStatus !== 'annulled' && isValidAnswer(row.question.answer) && isValidAnswer(row.attempt.answer);
}

function contribution(row: Row): { points: number; maximum: number; eligible: boolean; awarded: boolean } {
  const rule = row.rule;
  if (!rule || !Number.isFinite(rule.gain) || rule.gain < 0 || !Number.isFinite(rule.penalty) || !Number.isFinite(rule.omission)) return { points: 0, maximum: 0, eligible: false, awarded: false };
  if (row.question.keyStatus === 'annulled') {
    return rule.annulled === 'award'
      ? { points: rule.gain, maximum: rule.gain, eligible: true, awarded: true }
      : { points: 0, maximum: 0, eligible: false, awarded: false };
  }
  // An absent/unverified answer key is never guessed, even for a blank item.
  if (!isValidAnswer(row.question.answer)) return { points: 0, maximum: 0, eligible: false, awarded: false };
  const points = row.attempt.answer === null ? rule.omission : row.attempt.answer === row.question.answer ? rule.gain : -Math.abs(rule.penalty);
  return { points, maximum: rule.gain, eligible: true, awarded: false };
}

function statsForRows(state: AppState, rows: Row[], history: Row[], sessions: Session[], filter: StatsFilter): Stats {
  const bands: ConfidenceBand[] = [
    { from: 0, to: 25, label: '0–25%', attempts: 0, correct: 0, accuracy: null },
    { from: 26, to: 50, label: '26–50%', attempts: 0, correct: 0, accuracy: null },
    { from: 51, to: 75, label: '51–75%', attempts: 0, correct: 0, accuracy: null },
    { from: 76, to: 100, label: '76–100%', attempts: 0, correct: 0, accuracy: null },
  ];
  const stats: Stats = {
    attempts: rows.length, unique: new Set(rows.map(row => row.question.id)).size,
    correct: 0, wrong: 0, blank: 0, valid: 0, precision: null, errorRate: null, omissionRate: null,
    net: 0, maxPoints: 0, netRate: null, totalItems: 0, scoredItems: 0,
    assessedNet: 0, assessedMaxPoints: 0, assessedNetRate: null, meanMs: null, medianMs: null,
    highConfidenceErrors: 0, unrecordedConfidence: 0, repeatedErrors: 0, retention: null, sample: rows.length,
    sessionIds: [...new Set(rows.map(row => row.session.id))], scoredAttempts: 0,
    excludedUnknownKey: 0, excludedAnnulled: 0, missingRule: 0, awarded: 0, awardedUnpresented: 0,
    unpresented: 0, uniqueValid: 0, reviewSample: 0,
    novelAttempts: 0, repeatedAttempts: 0, novelPrecision: null, repeatedPrecision: null,
    novelNetRate: null, repeatedNetRate: null, confidenceBands: bands,
    initialChangesHelped: 0, initialChangesHurt: 0, noGainMs: 0, ruleVersions: [], keyVersions: {},
  };
  const first = new Map<string, Row>();
  const priorErrors = new Map<string, number>();
  const repeatedErrorIds = new Set<string>();
  const retentionIds = new Set<string>();
  for (const row of history) {
    if (!first.has(row.question.id)) first.set(row.question.id, row);
    else if (row.session.mode === 'review' && validForAccuracy(row)) retentionIds.add(row.attempt.id);
    if (validForAccuracy(row) && row.attempt.answer !== row.question.answer) {
      if ((priorErrors.get(row.question.id) || 0) > 0) repeatedErrorIds.add(row.attempt.id);
      priorErrors.set(row.question.id, (priorErrors.get(row.question.id) || 0) + 1);
    }
  }
  let retentionCorrect = 0;
  let novelValid = 0, novelCorrect = 0, repeatedValid = 0, repeatedCorrect = 0;
  let novelNet = 0, novelMaximum = 0, repeatedNet = 0, repeatedMaximum = 0;
  const uniqueValid = new Set<string>();
  for (const row of rows) {
    const { question, attempt, session } = row;
    stats.keyVersions[question.id] = question.keyVersion;
    if (!stats.ruleVersions.includes(session.rules.version)) stats.ruleVersions.push(session.rules.version);
    if (attempt.answer === null) stats.blank++;
    if (question.keyStatus === 'annulled' && row.rule?.annulled !== 'award') stats.excludedAnnulled++;
    else if (question.keyStatus !== 'annulled' && !isValidAnswer(question.answer)) stats.excludedUnknownKey++;
    if (!row.rule || !Number.isFinite(row.rule.gain) || row.rule.gain < 0 || !Number.isFinite(row.rule.penalty) || !Number.isFinite(row.rule.omission)) stats.missingRule++;
    const scored = contribution(row);
    stats.net += scored.points;
    stats.assessedMaxPoints += scored.maximum;
    if (scored.eligible) stats.scoredAttempts++;
    if (scored.awarded) stats.awarded++;
    if (scored.eligible && scored.points <= 0) stats.noGainMs += milliseconds(attempt);
    const novel = first.get(question.id)?.attempt.id === attempt.id;
    if (novel) { stats.novelAttempts++; novelNet += scored.points; novelMaximum += scored.maximum; }
    else { stats.repeatedAttempts++; repeatedNet += scored.points; repeatedMaximum += scored.maximum; }
    if (!validForAccuracy(row)) continue;
    const correct = attempt.answer === question.answer;
    stats.valid++;
    uniqueValid.add(question.id);
    if (correct) stats.correct++; else stats.wrong++;
    if (!correct && hasConfidence(attempt) && confidence(attempt.confidence) >= 80) stats.highConfidenceErrors++;
    if (!hasConfidence(attempt)) stats.unrecordedConfidence++;
    if (repeatedErrorIds.has(attempt.id)) stats.repeatedErrors++;
    if (retentionIds.has(attempt.id)) { stats.reviewSample++; if (correct) retentionCorrect++; }
    if (novel) { novelValid++; if (correct) novelCorrect++; }
    else { repeatedValid++; if (correct) repeatedCorrect++; }
    if (hasConfidence(attempt)) {
      const level = confidence(attempt.confidence);
      const band = bands[level <= 25 ? 0 : level <= 50 ? 1 : level <= 75 ? 2 : 3];
      band.attempts++;
      if (correct) band.correct++;
    }
    if (attempt.changes.length && isValidAnswer(attempt.initial) && attempt.initial !== attempt.answer) {
      if (correct && attempt.initial !== question.answer) stats.initialChangesHelped++;
      if (!correct && attempt.initial === question.answer) stats.initialChangesHurt++;
    }
  }
  stats.uniqueValid = uniqueValid.size;
  stats.precision = divide(stats.correct, stats.valid);
  stats.errorRate = divide(stats.wrong, stats.valid);
  stats.assessedNet = stats.net;
  stats.assessedNetRate = divide(stats.assessedNet, stats.assessedMaxPoints);
  stats.retention = divide(retentionCorrect, stats.reviewSample);
  stats.novelPrecision = divide(novelCorrect, novelValid);
  stats.repeatedPrecision = divide(repeatedCorrect, repeatedValid);
  stats.novelNetRate = divide(novelNet, novelMaximum);
  stats.repeatedNetRate = divide(repeatedNet, repeatedMaximum);
  for (const band of bands) band.accuracy = divide(band.correct, band.attempts);
  const times = rows.map(row => milliseconds(row.attempt)).sort((a, b) => a - b);
  if (times.length) {
    stats.meanMs = times.reduce((total, value) => total + value, 0) / times.length;
    const midpoint = Math.floor(times.length / 2);
    stats.medianMs = times.length % 2 ? times[midpoint] : (times[midpoint - 1] + times[midpoint]) / 2;
  }
  const from = dateBoundary(filter.from, false), to = dateBoundary(filter.to, true);
  for (const session of sessions) {
    if (session.status !== 'completed' || session.isDemo !== (filter.isDemo ?? state.demoMode) || (filter.mode && session.mode !== filter.mode)) continue;
    const completedTime = Date.parse(session.completedAt || session.startedAt);
    if ((from !== null && completedTime < from) || (to !== null && completedTime > to)) continue;
    for (const id of new Set(session.questionIds)) {
      const question = state.questions.find(item => item.id === id);
      if (!question || question.isDemo !== session.isDemo || !questionMatches(state, question, filter)) continue;
      stats.totalItems++;
      if (!stats.sessionIds.includes(session.id)) stats.sessionIds.push(session.id);
      if (!stats.ruleVersions.includes(session.rules.version)) stats.ruleVersions.push(session.rules.version);
      stats.keyVersions[question.id] = question.keyVersion;
      const presented = rows.some(row => row.session.id === session.id && row.question.id === id);
      if (!presented) stats.unpresented++;
      const rule = session.rules.blocks.find(block => block.id === question.block);
      const validRule = rule && Number.isFinite(rule.gain) && rule.gain >= 0 && Number.isFinite(rule.penalty) && Number.isFinite(rule.omission);
      if (!validRule || !rule) continue;
      const awarded = question.keyStatus === 'annulled' && rule.annulled === 'award';
      if (!awarded && (question.keyStatus === 'annulled' || !isValidAnswer(question.answer))) continue;
      stats.scoredItems++;
      stats.maxPoints += rule.gain;
      if (awarded && !presented) {
        // Annulment credit is a property of the selected exam item, not a guessed response.
        stats.net += rule.gain;
        stats.awarded++;
        stats.awardedUnpresented++;
      }
    }
  }
  // Unseen items contribute to the closed session's maximum but never become blanks.
  stats.omissionRate = divide(stats.blank, stats.totalItems);
  stats.netRate = divide(stats.net, stats.maxPoints);
  return stats;
}

/** Current official answer key + the immutable scoring rules captured by each session. */
export function calculateStats(state: AppState, filter: StatsFilter = {}): Stats {
  const isDemo = filter.isDemo ?? state.demoMode;
  const history = allRows(state, isDemo, state.sessions, true);
  const from = dateBoundary(filter.from, false), to = dateBoundary(filter.to, true);
  const rows = history.filter(row => {
    const timestamp = Date.parse(row.session.completedAt || row.session.startedAt);
    return questionMatches(state, row.question, filter)
      && row.session.status === 'completed'
      && (!filter.mode || row.session.mode === filter.mode)
      && (from === null || timestamp >= from) && (to === null || timestamp <= to);
  });
  return statsForRows(state, rows, history, state.sessions, { ...filter, isDemo });
}

export function computeSessionStats(state: AppState, session: Session): Stats {
  const sessions = state.sessions.filter(existing => existing.id !== session.id).concat(session);
  const history = allRows(state, session.isDemo, sessions, true);
  return statsForRows(state, history.filter(row => row.session.id === session.id && session.status === 'completed'), history, [session], { isDemo: session.isDemo });
}

function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

/** A task already has an isolated checkout; session creation does not alter repository configuration. */
export function createSession(state: AppState, mode: Mode, ids: string[], now: string | Date = new Date()): Session {
  const startedAt = typeof now === 'string' ? new Date(now).toISOString() : now.toISOString();
  const questionIds = [...new Set(ids)].filter(id => state.questions.some(question => question.id === id && question.isDemo === state.demoMode));
  const demoBlockIds = [...new Set(questionIds.map(id => state.questions.find(question => question.id === id)!.block))];
  const rules: Session['rules'] = state.demoMode ? {
    version: 'demonstracao-v1', verified: false, specialty: 'Exemplos de funcionamento; sem estrutura oficial',
    sourceUrl: '', sourceName: 'Configuração educativa da demonstração', consultedAt: startedAt.slice(0, 10),
    blocks: (demoBlockIds.length ? demoBlockIds : ['general']).map(id => ({ id, name: 'Demonstração: +1 / −1 / 0', items: null, gain: 1, penalty: 1, omission: 0, minimum: null, annulled: 'exclude' })),
    totalMinimum: null, durationMinutes: null, dates: [], writingRules: 'Demonstração livre; sem rubrica oficial.',
    notes: 'Regras exclusivas dos exemplos autorais de demonstração. Não representam a prova oficial e não integram os resultados reais.',
  } : JSON.parse(JSON.stringify(state.rules)) as Session['rules'];
  return {
    id: newId('session'), mode, questionIds, status: 'active', startedAt,
    currentIndex: 0, rules, isDemo: state.demoMode,
    durationMinutes: mode === 'simulation' ? rules.durationMinutes : null,
    attempts: questionIds.map((questionId, index) => ({
      id: newId('attempt'), questionId, initial: null, answer: null, changes: [],
      confidence: 50, confidenceRecorded: false, elapsedMs: 0, presentedAt: index === 0 ? startedAt : '', submitted: false,
      note: '', marked: false, keyVersionAtAnswer: state.questions.find(question => question.id === questionId)?.keyVersion || 1,
    })),
  };
}

function initialErrorType(attempt: Attempt): Review['errorType'] {
  if (attempt.errorType) return attempt.errorType;
  if (!hasConfidence(attempt)) return 'Falta de conhecimento';
  return confidence(attempt.confidence) >= 80 ? 'Excesso de confiança' : confidence(attempt.confidence) <= 25 ? 'Chute' : 'Falta de conhecimento';
}

/** New review records only. The caller completes the old review separately. */
export function scheduleReviews(state: AppState, session: Session): Review[] {
  if (session.status !== 'completed') return [];
  const configured = state.profile.reviewIntervals.filter(days => Number.isFinite(days) && days > 0).map(days => Math.max(1, Math.round(days)));
  const intervals = configured.length ? configured : [1, 7, 15, 30];
  const result: Review[] = [];
  for (const row of allRows(state, session.isDemo, [session])) {
    const { question, attempt } = row;
    if (question.keyStatus === 'annulled' || !isValidAnswer(question.answer)) continue;
    if (state.reviews.some(review => review.sessionId === session.id && review.questionId === question.id && review.isDemo === session.isDemo)) continue;
    const reviewTime = (review: Review) => {
      const originalSession = state.sessions.find(existing => existing.id === review.sessionId);
      return originalSession?.completedAt || originalSession?.startedAt || review.completedAt || review.dueAt;
    };
    const previous = state.reviews.filter(review => review.questionId === question.id && review.isDemo === session.isDemo)
      .sort((a, b) => reviewTime(b).localeCompare(reviewTime(a)))[0];
    const wrong = isValidAnswer(attempt.answer) && attempt.answer !== question.answer;
    const uncertain = attempt.answer === question.answer && hasConfidence(attempt) && confidence(attempt.confidence) <= 50;
    const successfulReview = session.mode === 'review' && Boolean(previous) && attempt.answer === question.answer;
    if (!wrong && !uncertain && !attempt.marked && !successfulReview) continue;
    const reason: Review['reason'] = wrong ? 'error' : uncertain ? 'uncertain' : attempt.marked ? 'marked' : previous!.reason;
    const stage = wrong ? 0 : uncertain ? Math.max(0, (previous?.stage ?? 0) - 1) : successfulReview && hasConfidence(attempt) && confidence(attempt.confidence) > 50 ? Math.min((previous?.stage ?? -1) + 1, intervals.length - 1) : previous?.stage ?? 0;
    const finished = Date.parse(session.completedAt || row.time);
    const baseline = Number.isFinite(finished) ? finished : Date.now();
    result.push({
      id: `review:${session.id}:${attempt.id}`, questionId: question.id, sessionId: session.id,
      dueAt: new Date(baseline + intervals[Math.min(stage, intervals.length - 1)] * 86_400_000).toISOString(),
      stage, reason, errorType: attempt.errorType || previous?.errorType || initialErrorType(attempt),
      concept: question.explanation?.concept || previous?.concept || '',
      note: attempt.note || previous?.note || '', isDemo: session.isDemo,
    });
  }
  return result;
}

export interface PriorityResult {
  priority: number;
  score: number;
  label: string;
  reasons: string[];
  evidence: string[];
  canConsolidate: boolean;
}

function topicPriority(state: AppState, topic: Topic, isDemo: boolean, stats: Stats, now = Date.now()): PriorityResult {
  const questions = state.questions.filter(question => question.isDemo === isDemo && matchesTopic(state, question, topic.id));
  const ids = new Set(questions.map(question => question.id));
  const pending = state.reviews.filter(review => review.isDemo === isDemo && !review.completedAt && ids.has(review.questionId));
  const overdue = pending.filter(review => Date.parse(review.dueAt) <= now).length;
  const recentRows = allRows(state, isDemo).filter(row => ids.has(row.question.id)).slice(-40);
  const recentValid = recentRows.filter(validForAccuracy);
  const recentPrecision = divide(recentValid.filter(row => row.attempt.answer === row.question.answer).length, recentValid.length);
  const recentScore = recentRows.map(contribution);
  const recentNetRate = divide(recentScore.reduce((sum, row) => sum + row.points, 0), recentScore.reduce((sum, row) => sum + row.maximum, 0));
  const evidence = [
    `${stats.uniqueValid} questões únicas com resposta julgável; ${stats.valid} respostas válidas.`,
    stats.precision === null ? 'Precisão ainda sem dados.' : `Precisão observada de ${(stats.precision * 100).toFixed(1)}%.`,
    stats.retention === null ? 'Retenção ainda sem revisão posterior julgável.' : `Retenção de ${(stats.retention * 100).toFixed(1)}% em ${stats.reviewSample} revisões posteriores.`,
    `${stats.repeatedErrors} reincidências; ${stats.highConfidenceErrors} erros com confiança de pelo menos 80%.`,
    recentPrecision === null ? 'Sem respostas válidas recentes.' : `Precisão recente de ${(recentPrecision * 100).toFixed(1)}% nas últimas ${recentValid.length} respostas válidas (janela de até 40 itens).`,
    stats.netRate === null ? 'Sem denominador pontuável para o aproveitamento líquido.' : `Aproveitamento líquido de ${(stats.netRate * 100).toFixed(1)}%; versões das regras: ${stats.ruleVersions.join(', ')}.`,
    recentNetRate === null ? 'Sem denominador líquido recente.' : `Aproveitamento líquido recente de ${(recentNetRate * 100).toFixed(1)}% na janela de até 40 itens.`,
  ];
  // A transparent conservative initial criterion, not a prediction of approval.
  const canConsolidate = stats.uniqueValid >= 20 && stats.valid >= 25 && stats.precision !== null && stats.precision >= 0.85
    && recentPrecision !== null && recentPrecision >= 0.85
    && stats.netRate !== null && stats.netRate >= 0.6 && recentNetRate !== null && recentNetRate >= 0.5
    && stats.reviewSample >= 5 && stats.retention !== null && stats.retention >= 0.8
    && stats.repeatedErrors / Math.max(1, stats.valid) <= 0.1 && overdue === 0;
  let priority = 20;
  const reasons: string[] = [];
  if (stats.uniqueValid === 0) { priority += 28; reasons.push('Sem linha de base: iniciar diagnóstico com questões inéditas.'); }
  else if (stats.uniqueValid < 20) { priority += 15; reasons.push(`Amostra pequena (${stats.uniqueValid}/20 únicas): ampliar a cobertura antes de concluir domínio.`); }
  if (recentPrecision !== null) {
    const gap = Math.max(0, 0.85 - recentPrecision);
    priority += gap * 40;
    if (gap > 0) reasons.push('Precisão recente abaixo do critério inicial de domínio de 85%.');
  }
  if (recentNetRate !== null && recentNetRate < 0.5) { priority += 10; reasons.push('Aproveitamento líquido recente abaixo de 50%; corrigir perdas por penalidade.'); }
  if (overdue) { priority += Math.min(25, 10 + overdue * 3); reasons.push(`${overdue} revisões vencidas pedem recuperação ativa.`); }
  if (stats.highConfidenceErrors) { priority += Math.min(12, stats.highConfidenceErrors * 3); reasons.push('Erros com alta confiança exigem conferir o conceito e calibrar a confiança.'); }
  if (stats.repeatedErrors) { priority += Math.min(12, stats.repeatedErrors * 3); reasons.push('Há erros reincidentes: revisar o motivo antes de repetir questões.'); }
  if (stats.reviewSample > 0 && stats.retention !== null && stats.retention < 0.8) { priority += 10; reasons.push('Retenção abaixo do critério inicial de 80% nas revisões observadas.'); }
  const block = state.rules.blocks.find(rule => rule.id === topic.block);
  if (state.rules.verified && block && Number.isFinite(block.gain) && block.gain > 0) {
    const maximumGain = Math.max(...state.rules.blocks.map(rule => Number.isFinite(rule.gain) ? Math.max(0, rule.gain) : 0));
    if (maximumGain > 0) {
      priority += 10 * block.gain / maximumGain;
      reasons.push(`Cada item do bloco ${block.name} vale ${block.gain} ponto(s) por acerto, conforme a versão ${state.rules.version}; o peso por item foi considerado sem presumir incidência do tópico.`);
    }
  }
  if (state.rules.verified && block?.minimum !== null && block?.minimum !== undefined) {
    priority += 5;
    reasons.push(`O bloco tem mínimo eliminatório verificado (${block.minimum}); o risco real exige um simulado completo.`);
    const latestSimulation = state.sessions.filter(session => session.isDemo === isDemo && session.status === 'completed' && session.mode === 'simulation')
      .sort((a, b) => (b.completedAt || b.startedAt).localeCompare(a.completedAt || a.startedAt))[0];
    const snapshot = latestSimulation?.rules.blocks.find(rule => rule.id === topic.block);
    if (latestSimulation?.rules.verified && snapshot?.minimum !== null && snapshot?.minimum !== undefined && snapshot.items !== null && snapshot.items > 0) {
      const blockRows = allRows(state, isDemo, [latestSimulation]).filter(row => row.question.block === topic.block);
      const unresolved = blockRows.some(row => !row.rule || (row.question.keyStatus !== 'annulled' && !isValidAnswer(row.question.answer)));
      if (blockRows.length >= snapshot.items && !unresolved) {
        const net = blockRows.reduce((sum, row) => sum + contribution(row).points, 0);
        if (net < snapshot.minimum) {
          priority += 15;
          reasons.push(`Último simulado completo: ${net} pontos no bloco, abaixo do mínimo de ${snapshot.minimum} da versão ${latestSimulation.rules.version}.`);
        }
      }
    }
  }
  if (state.rules.verified && topic.verified && topic.weight !== undefined && topic.weight > 0) {
    const maximum = Math.max(...state.topics.filter(item => item.verified).map(item => item.weight || 0), topic.weight);
    priority += 10 * topic.weight / maximum;
    reasons.push(`Peso oficial registrado para o tópico: ${topic.weight}.`);
  } else reasons.push('Peso/incidência do tópico não verificados; não foram inventados no cálculo.');
  if (topic.difficulty >= 4) { priority += 4; reasons.push('Dificuldade percebida alta: reservar tempo para correção e teoria direcionada.'); }
  if (canConsolidate) { priority = Math.min(priority, 30); reasons.push('Critérios iniciais de consolidação atendidos; manter contato periódico.'); }
  priority = Math.max(0, Math.min(100, Math.round(priority)));
  return { priority, score: priority, label: priority >= 75 ? 'Muito alta' : priority >= 55 ? 'Alta' : priority >= 35 ? 'Média' : canConsolidate ? 'Manutenção' : 'Baixa', reasons, evidence, canConsolidate };
}

export function getPriority(state: AppState, topic: Topic | string, isDemo = state.demoMode): PriorityResult {
  const definition = typeof topic === 'string' ? state.topics.find(item => item.id === topic) : topic;
  if (!definition) return { priority: 0, score: 0, label: 'Sem tópico', reasons: ['Tópico não cadastrado.'], evidence: [], canConsolidate: false };
  return topicPriority(state, definition, isDemo, calculateStats(state, { topic: definition.id, isDemo }));
}

export function deriveTopicStats(state: AppState, topicId: string, isDemo = state.demoMode) {
  const definition = state.topics.find(topic => topic.id === topicId);
  const stats = calculateStats(state, { topic: topicId, isDemo });
  const priority = definition ? topicPriority(state, definition, isDemo, stats) : getPriority(state, topicId, isDemo);
  const questions = state.questions.filter(question => question.isDemo === isDemo && matchesTopic(state, question, topicId));
  const ids = new Set(questions.map(question => question.id));
  const reviews = state.reviews.filter(review => review.isDemo === isDemo && ids.has(review.questionId));
  const pending = reviews.filter(review => !review.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const rows = allRows(state, isDemo).filter(row => ids.has(row.question.id));
  const status: Topic['status'] = !stats.attempts ? 'not-started' : priority.canConsolidate ? 'consolidated' : pending.length || stats.reviewSample ? 'reviewing' : 'studying';
  return {
    ...stats, ...priority, status, questionCount: questions.length,
    coverage: divide(stats.uniqueValid, questions.filter(question => question.keyStatus !== 'annulled' && isValidAnswer(question.answer)).length),
    lastStudy: rows.at(-1)?.time || null,
    lastReview: rows.filter(row => row.session.mode === 'review').at(-1)?.time || null,
    nextReview: pending[0]?.dueAt || null,
    pendingReviews: pending.length,
    reviewsDue: pending.filter(review => Date.parse(review.dueAt) <= Date.now()).length,
  };
}

/** Semicolon-delimited UTF-8 CSV suitable for Brazilian spreadsheets. */
export function exportCsvRows(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '\uFEFF';
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Excel/Sheets may evaluate formulas after whitespace; protect imported text.
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [keys.map(escape).join(';'), ...rows.map(row => keys.map(key => escape(row[key])).join(';'))].join('\r\n');
}
