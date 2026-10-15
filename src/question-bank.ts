import { validQuestionEvidence } from './question-evidence';
import type { AppState, ExamRules, Explanation, Question, SourceRecord, Topic } from './types';

/** A package contains source material only, never a student's study history. */
export interface QuestionBank {
  id: string;
  version: string;
  title: string;
  description: string;
  consultedAt: string;
  questions: Question[];
  sources?: SourceRecord[];
  coverage?: unknown;
}

export interface QuestionBankValidation {
  bank: QuestionBank | null;
  errors: string[];
  warnings: string[];
}

export const BUNDLED_BANK_URL = '/question-banks/cebraspe-cgu-ti-v1.json';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const answer = (value: unknown) => value === 'C' || value === 'E' || value === null;
const statuses = ['preliminary', 'final', 'changed', 'annulled'];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const publicUrl = (value: unknown): value is string => {
  if (!text(value)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
};

const boardIdentity = (board: string) => ['cebraspe', 'cespe', 'cespe/cebraspe', 'cespe/unb'].includes(normalize(board)) ? 'cebraspe' : normalize(board);
const itemIdentity = (value: string) => normalize(value).replace(/^0+(?=\d+$)/, '');
function canonicalUrl(value: string) {
  try {
    const url = new URL(value); url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return value.split('#')[0]; }
}

/** Retain multiple independent identifiers: exam labels can change between packages. */
function originalEvidence(question: Question): string[] {
  const scope = `${boardIdentity(question.board)}|${question.year}`;
  if (!question.itemNumber?.trim()) return [`text|${scope}|${normalize(question.examId ?? '')}|${canonicalUrl(question.sourceUrl ?? '')}|${normalize(question.statement)}|${question.code ?? ''}`];
  const item = itemIdentity(question.itemNumber), keys: string[] = [];
  if (question.examId?.trim()) keys.push(`exam|${scope}|${normalize(question.examId)}|${item}`);
  // A contest landing page may cover several cadernos; its URL is not an item identity.
  if (question.sourceUrl) {
    const url = canonicalUrl(question.sourceUrl);
    if (/\.pdf$/i.test(new URL(url).pathname)) keys.push(`document|${scope}|${url}|${item}`);
  }
  if (question.pdfAssetUrl) keys.push(`asset|${scope}|${question.pdfAssetUrl}|${item}`);
  const sha256 = (question as unknown as Record<string, unknown>).proofSha256;
  if (typeof sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sha256)) keys.push(`sha256|${scope}|${sha256.toLowerCase()}|${item}`);
  // A non-document URL can still identify a manually imported item with no exam label.
  if (!keys.length) keys.push(`unlabelled|${scope}|${canonicalUrl(question.sourceUrl ?? '')}|${item}|${normalize(question.statement)}|${question.code ?? ''}`);
  return keys;
}

type QuestionIndex = Map<string, Set<Question>>;
function indexQuestion(index: QuestionIndex, evidence: Question, target = evidence) {
  for (const key of originalEvidence(evidence)) {
    const matches = index.get(key) ?? new Set<Question>(); matches.add(target); index.set(key, matches);
  }
}
function findQuestions(index: QuestionIndex, byId: Map<string, Question>, question: Question): Question[] {
  const matches = new Set<Question>();
  const idMatch = byId.get(question.id); if (idMatch) matches.add(idMatch);
  for (const key of originalEvidence(question)) for (const match of index.get(key) ?? []) matches.add(match);
  return [...matches];
}
function shareOriginalEvidence(a: Question, b: Question) {
  const keys = new Set(originalEvidence(a)); return originalEvidence(b).some(key => keys.has(key));
}
function sameSource(a: SourceRecord, b: SourceRecord) {
  const signature = (source: SourceRecord) => JSON.stringify(Object.entries(source).sort(([aKey], [bKey]) => aKey.localeCompare(bKey)));
  return signature(a) === signature(b);
}

/** Independent of the local id so reinstalling an exam cannot inflate the bank. */
export function officialQuestionIdentity(question: Question): string {
  if (question.examId && question.itemNumber) return `${question.year}|${normalize(question.examId)}|${itemIdentity(question.itemNumber)}`;
  // A file URL and its original item number also identify questions imported manually.
  if (question.sourceUrl && question.itemNumber) return `${question.year}|${canonicalUrl(question.sourceUrl)}|${itemIdentity(question.itemNumber)}`;
  return `${question.year}|${question.sourceUrl ?? ''}|${normalize(question.statement)}|${question.code ?? ''}`;
}

function sameOriginal(a: Question, b: Question) {
  return a.statement === b.statement && (a.code ?? '') === (b.code ?? '') && a.answer === b.answer && a.keyStatus === b.keyStatus && a.keyVersion === b.keyVersion
    && a.topicId === b.topicId && a.discipline === b.discipline && a.topic === b.topic && a.block === b.block && boardIdentity(a.board) === boardIdentity(b.board);
}

/** Fail closed: a partially invalid package cannot be installed as a verified bank. */
export function validateQuestionBank(input: unknown, stateTopics: Topic[], stateRules: ExamRules): QuestionBankValidation {
  const errors: string[] = [], warnings: string[] = [];
  if (!record(input)) return { bank: null, errors: ['O pacote de questões deve ser um objeto JSON.'], warnings };
  for (const field of ['id', 'version', 'title', 'description']) if (!text(input[field])) errors.push(`Metadado obrigatório: ${field}.`);
  if (!date(input.consultedAt)) errors.push('A data de consulta do pacote é inválida.');
  if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 10000) errors.push('O pacote deve conter entre 1 e 10.000 questões verificáveis.');
  if (input.sources !== undefined && !Array.isArray(input.sources)) errors.push('A lista de fontes é inválida.');
  const sources: SourceRecord[] = [];
  const sourceIds = new Map<string, SourceRecord>();
  if (Array.isArray(input.sources)) for (const [index, source] of input.sources.entries()) {
    if (!record(source) || !text(source.id) || !text(source.title) || !publicUrl(source.url) || !date(source.consultedAt) || !['verified', 'uploaded', 'unavailable'].includes(String(source.status)) || !text(source.detail)
      || ['fileName', 'extractedText', 'documentId'].some(key => source[key] !== undefined && typeof source[key] !== 'string')
      || (source.assetUrl !== undefined && (typeof source.assetUrl !== 'string' || !/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(source.assetUrl)))) {
      errors.push(`Fonte ${index + 1}: identificação, URL, data ou documentação inválida.`);
    } else {
      const candidate = { ...source } as unknown as SourceRecord;
      const previous = sourceIds.get(source.id);
      if (previous && !sameSource(previous, candidate)) errors.push(`Fonte duplicada conflitante: ${source.id}.`);
      else if (previous) warnings.push(`Fonte idêntica repetida ignorada: ${source.id}.`);
      else { sourceIds.set(source.id, candidate); sources.push(candidate); }
    }
  }
  const questions: Question[] = [], byId = new Map<string, Question>(), byOriginal: QuestionIndex = new Map();
  const topics = new Map(stateTopics.map(topic => [topic.id, topic]));
  const blocks = new Set(stateRules.blocks.map(block => block.id));
  if (Array.isArray(input.questions)) for (const [index, raw] of input.questions.entries()) {
    const prefix = `Item ${index + 1}`;
    const previousErrors = errors.length;
    if (!record(raw)) { errors.push(`${prefix}: questão inválida.`); continue; }
    const missing = ['id', 'statement', 'organization', 'role', 'discipline', 'topic', 'topicId', 'block', 'source'].filter(key => !text(raw[key]));
    if (missing.length) { errors.push(`${prefix}: confira ${missing.join(', ')}.`); continue; }
    if (typeof raw.board !== 'string' || !['cebraspe', 'cespe', 'cespe/cebraspe', 'cespe/unb'].includes(normalize(raw.board))) errors.push(`${prefix}: somente questões oficiais Cebraspe/Cespe são aceitas.`);
    if (raw.origin !== 'official' || raw.isDemo !== false) errors.push(`${prefix}: demonstrações e questões autorais não pertencem à base oficial.`);
    if (!Number.isInteger(raw.year) || Number(raw.year) < 1980 || Number(raw.year) > new Date().getFullYear()) errors.push(`${prefix}: informe o ano da prova anterior.`);
    if (!publicUrl(raw.sourceUrl)) errors.push(`${prefix}: a fonte deve ter uma URL pública válida.`);
    if (!date(raw.importedAt) || typeof raw.favorite !== 'boolean') errors.push(`${prefix}: metadados de importação inválidos.`);
    const topic = topics.get(String(raw.topicId));
    if (!topic) errors.push(`${prefix}: o tópico não existe no edital selecionado.`);
    else if (raw.discipline !== topic.discipline || raw.topic !== topic.name || raw.block !== topic.block || !blocks.has(String(raw.block))) errors.push(`${prefix}: disciplina, assunto e bloco devem corresponder ao item do edital.`);
    for (const field of ['code', 'language', 'subtopic', 'examId', 'itemNumber', 'difficulty', 'difficultyCriterion', 'pdfDocumentId']) if (raw[field] !== undefined && typeof raw[field] !== 'string') errors.push(`${prefix}: ${field} deve ser texto.`);
    if (raw.pdfAssetUrl !== undefined && (typeof raw.pdfAssetUrl !== 'string' || !/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(raw.pdfAssetUrl))) errors.push(`${prefix}: o PDF deve ser um documento local válido da plataforma.`);
    if (!validQuestionEvidence(raw)) errors.push(`${prefix}: páginas originais ou metadados de conferência inválidos.`);
    if (raw.pdfPage !== undefined && (!Number.isInteger(raw.pdfPage) || Number(raw.pdfPage) < 1)) errors.push(`${prefix}: página do PDF inválida.`);
    if (raw.difficulty && !text(raw.difficultyCriterion)) errors.push(`${prefix}: dificuldade exige um critério documentado.`);
    if (!answer(raw.answer) || !statuses.includes(String(raw.keyStatus)) || !Number.isInteger(raw.keyVersion) || Number(raw.keyVersion) < 1
      || (raw.keyStatus === 'annulled' ? raw.answer !== null : raw.answer === null)) errors.push(`${prefix}: gabarito, situação ou versão inválidos.`);
    const history = raw.keyHistory;
    if (!Array.isArray(history) || !history.length) errors.push(`${prefix}: histórico e origem do gabarito são obrigatórios.`);
    else {
      const versions = new Set<number>();
      for (const entry of history) {
        if (!record(entry) || !Number.isInteger(entry.version) || Number(entry.version) < 1 || Number(entry.version) > Number(raw.keyVersion) || versions.has(Number(entry.version)) || !answer(entry.answer) || !statuses.includes(String(entry.status)) || !date(entry.date) || !text(entry.source)
          || (entry.status === 'annulled' ? entry.answer !== null : entry.answer === null)) errors.push(`${prefix}: versão do histórico de gabarito inválida.`);
        else versions.add(Number(entry.version));
      }
      const current = history.find(entry => record(entry) && entry.version === raw.keyVersion);
      if (!record(current) || current.answer !== raw.answer || current.status !== raw.keyStatus) errors.push(`${prefix}: o gabarito atual não corresponde à versão do histórico.`);
    }
    let explanation: Explanation | undefined;
    if (raw.explanation !== undefined) {
      const e = raw.explanation;
      if (!record(e) || !text(e.direct) || !Array.isArray(e.steps) || !e.steps.every(step => typeof step === 'string') || !['source', 'human', 'ai'].includes(String(e.author)) || typeof e.validated !== 'boolean'
        || ['decisive', 'concept', 'whyWrong', 'rewrite', 'trap', 'summary', 'reference', 'divergence'].some(key => e[key] !== undefined && typeof e[key] !== 'string')) errors.push(`${prefix}: comentário inválido ou de demonstração.`);
      else {
        const validated = e.validated === true && e.author !== 'ai' && text(e.reference);
        if (e.validated && !validated) warnings.push(`${prefix}: comentário automático ou sem referência mantido como não validado.`);
        explanation = { ...e, validated } as unknown as Explanation;
      }
    }
    if (errors.length !== previousErrors) continue;
    // All optional document provenance is carried through for source inspection.
    const question = { ...raw, explanation } as unknown as Question;
    const matches = findQuestions(byOriginal, byId, question);
    if (matches.length > 1) { errors.push(`${prefix}: identificadores ambíguos apontam para itens diferentes (${matches.map(match => match.id).join(', ')}).`); continue; }
    const duplicate = matches[0];
    if (duplicate) {
      if (!shareOriginalEvidence(duplicate, question) || !sameOriginal(duplicate, question)) errors.push(`${prefix}: duplicata conflitante de ${duplicate.id}.`);
      else {
        warnings.push(`${prefix}: duplicata ignorada (${duplicate.id}).`);
        // Keep aliases from the duplicate so later rows cannot reintroduce it.
        byId.set(question.id, duplicate); indexQuestion(byOriginal, question, duplicate);
      }
      continue;
    }
    byId.set(question.id, question); indexQuestion(byOriginal, question); questions.push(question);
  }
  if (errors.length) return { bank: null, errors, warnings };
  return { bank: { ...input, questions, ...(input.sources !== undefined ? { sources } : {}) } as unknown as QuestionBank, errors, warnings };
}

/** Additive installation: existing questions and all study evidence are immutable here. */
export function mergeQuestionBank(state: AppState, bank: QuestionBank): { state: AppState; added: number; existing: number; conflicts: string[] } {
  const checked = validateQuestionBank(bank, state.topics, state.rules);
  if (!checked.bank) return { state, added: 0, existing: 0, conflicts: checked.errors };
  const additions: Question[] = [], conflicts: string[] = [];
  let existing = 0;
  const byId = new Map(state.questions.map(question => [question.id, question]));
  const byOriginal: QuestionIndex = new Map();
  for (const question of state.questions) if (!question.isDemo) indexQuestion(byOriginal, question);
  for (const question of checked.bank.questions) {
    const matches = findQuestions(byOriginal, byId, question);
    if (matches.length > 1) {
      existing++;
      conflicts.push(`${question.id}: identificadores ambíguos apontam para ${matches.map(match => match.id).join(', ')}. Os itens existentes e seu histórico foram preservados; confira o caderno e o número antes de unificar.`);
      continue;
    }
    const match = matches[0];
    if (match) {
      existing++;
      if (!shareOriginalEvidence(match, question) || !sameOriginal(match, question) || match.isDemo) conflicts.push(`${question.id}: o item existente ${match.id} foi preservado integralmente, inclusive seu gabarito v${match.keyVersion}. Confira identificadores, classificação e qualquer divergência em Alterar gabarito.`);
      else { byId.set(question.id, match); indexQuestion(byOriginal, question, match); }
      continue;
    }
    const addition = structuredClone(question);
    additions.push(addition); byId.set(addition.id, addition); indexQuestion(byOriginal, addition);
  }
  const currentSources = new Map(state.sources.map(source => [source.id, source]));
  const sourceAdditions: SourceRecord[] = [];
  for (const source of checked.bank.sources ?? []) {
    const current = currentSources.get(source.id);
    if (!current) { sourceAdditions.push(source); currentSources.set(source.id, source); }
    else if (!sameSource(current, source)) conflicts.push(`Fonte ${source.id}: a documentação existente foi preservada; o pacote contém metadados diferentes para o mesmo identificador.`);
  }
  if (!additions.length && !sourceAdditions.length) return { state, added: 0, existing, conflicts };
  return { state: { ...state, questions: [...state.questions, ...additions], sources: [...state.sources, ...structuredClone(sourceAdditions)] }, added: additions.length, existing, conflicts };
}
