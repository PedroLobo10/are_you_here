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

/** Independent of the local id so reinstalling an exam cannot inflate the bank. */
export function officialQuestionIdentity(question: Question): string {
  if (question.examId && question.itemNumber) return `${question.year}|${normalize(question.examId)}|${normalize(question.itemNumber)}`;
  // A file URL and its original item number also identify questions imported manually.
  if (question.sourceUrl && question.itemNumber) return `${question.year}|${question.sourceUrl.split('#')[0]}|${normalize(question.itemNumber)}`;
  return `${question.year}|${question.sourceUrl ?? ''}|${normalize(question.statement)}|${question.code ?? ''}`;
}

function sameOriginal(a: Question, b: Question) {
  return a.statement === b.statement && (a.code ?? '') === (b.code ?? '') && a.answer === b.answer && a.keyStatus === b.keyStatus && a.keyVersion === b.keyVersion;
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
  const sourceIds = new Set<string>();
  if (Array.isArray(input.sources)) for (const [index, source] of input.sources.entries()) {
    if (!record(source) || !text(source.id) || !text(source.title) || !publicUrl(source.url) || !date(source.consultedAt) || !['verified', 'uploaded', 'unavailable'].includes(String(source.status)) || !text(source.detail)
      || ['fileName', 'extractedText', 'documentId'].some(key => source[key] !== undefined && typeof source[key] !== 'string')
      || (source.assetUrl !== undefined && (typeof source.assetUrl !== 'string' || !/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(source.assetUrl)))) {
      errors.push(`Fonte ${index + 1}: identificação, URL, data ou documentação inválida.`);
    } else if (sourceIds.has(source.id)) errors.push(`Fonte duplicada: ${source.id}.`);
    else { sourceIds.add(source.id); sources.push({ ...source } as unknown as SourceRecord); }
  }
  const questions: Question[] = [], byId = new Map<string, Question>(), byOriginal = new Map<string, Question>();
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
    const identity = officialQuestionIdentity(question);
    const duplicate = byId.get(question.id) ?? byOriginal.get(identity);
    if (duplicate) {
      if (!sameOriginal(duplicate, question)) errors.push(`${prefix}: duplicata conflitante de ${duplicate.id}.`);
      else warnings.push(`${prefix}: duplicata ignorada (${duplicate.id}).`);
      continue;
    }
    byId.set(question.id, question); byOriginal.set(identity, question); questions.push(question);
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
  const byOriginal = new Map(state.questions.filter(question => !question.isDemo).map(question => [officialQuestionIdentity(question), question]));
  for (const question of checked.bank.questions) {
    const original = byId.get(question.id) ?? byOriginal.get(officialQuestionIdentity(question));
    // Imported manually: match the official document/item as a second identity.
    const match = original ?? state.questions.find(q => !q.isDemo && q.sourceUrl === question.sourceUrl && q.itemNumber && q.itemNumber === question.itemNumber && q.year === question.year);
    if (match) {
      existing++;
      if (!sameOriginal(match, question) || match.isDemo) conflicts.push(`${question.id}: o item existente ${match.id} foi preservado integralmente, inclusive seu gabarito v${match.keyVersion}. Confira qualquer divergência em Alterar gabarito.`);
      continue;
    }
    const addition = structuredClone(question);
    additions.push(addition); byId.set(addition.id, addition); byOriginal.set(officialQuestionIdentity(addition), addition);
  }
  const sourceAdditions = (checked.bank.sources ?? []).filter(source => !state.sources.some(existingSource => existingSource.id === source.id));
  if (!additions.length && !sourceAdditions.length) return { state, added: 0, existing, conflicts };
  return { state: { ...state, questions: [...state.questions, ...additions], sources: [...state.sources, ...structuredClone(sourceAdditions)] }, added: additions.length, existing, conflicts };
}
