import { useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, Download, ExternalLink, Library, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { ModuleProps } from '../types';
import { BUNDLED_BANK_URL, mergeQuestionBank, validateQuestionBank } from '../question-bank';
import type { QuestionBank } from '../question-bank';
import { downloadFile } from '../storage';
import QuestionStatement from './QuestionStatement';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const publicHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
};
const localPdfAsset = (value: unknown): value is string => typeof value === 'string' && /^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(value);

export default function BankCatalog({ state, update }: ModuleProps) {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const hasDelayedSession = state.sessions.some(session => session.status === 'active' && ['simulation', 'battery', 'diagnostic'].includes(session.mode));
  const preview = useMemo(() => bank ? mergeQuestionBank(state, bank) : null, [state, bank]);
  const realCount = state.questions.filter(question => !question.isDemo && question.origin === 'official').length;
  const coverage = object(bank?.coverage) ? bank.coverage : null;
  const blockCoverage = coverage && object(coverage.byBlock)
    ? Object.entries(coverage.byBlock).filter((entry): entry is [string, number] => count(entry[1]))
    : [];
  const topicCoverage = coverage && count(coverage.coveredTopics) && count(coverage.topicCount) && coverage.topicCount > 0 && coverage.coveredTopics <= coverage.topicCount
    ? { covered: coverage.coveredTopics, total: coverage.topicCount } : null;
  const disciplineCoverage = coverage && count(coverage.coveredDisciplines) && count(coverage.disciplineCount) && coverage.disciplineCount > 0 && coverage.coveredDisciplines <= coverage.disciplineCount
    ? { covered: coverage.coveredDisciplines, total: coverage.disciplineCount } : null;
  const missingDisciplines = coverage && Array.isArray(coverage.missingDisciplines)
    ? coverage.missingDisciplines.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  const sourceLinks = bank?.sources?.length ? bank.sources.map(source => {
    const metadata = source as unknown as Record<string, unknown>;
    return { id: source.id, title: source.title, url: source.url, detail: source.detail, assetUrl: localPdfAsset(source.assetUrl) ? source.assetUrl : undefined, mirrorUrl: publicHttpUrl(metadata.mirrorUrl) ? metadata.mirrorUrl : undefined };
  }) : [...new Map((bank?.questions ?? []).map(question => [question.sourceUrl, { id: question.id, title: question.source, url: question.sourceUrl!, detail: `${question.organization} · ${question.year}`, assetUrl: localPdfAsset(question.pdfAssetUrl) ? question.pdfAssetUrl : undefined, mirrorUrl: undefined }])).values()];
  const grouped = useMemo(() => {
    const groups = new Map<string, { block: string; discipline: string; count: number; recent: number; newest: number; transcribed: number }>();
    for (const question of bank?.questions ?? []) {
      const key = `${question.block}|${question.discipline}`;
      const group = groups.get(key) ?? { block: question.block, discipline: question.discipline, count: 0, recent: 0, newest: 0, transcribed: 0 };
      group.count++; if ((question.year ?? 0) >= 2025) group.recent++; group.newest = Math.max(group.newest, question.year ?? 0); if (question.keyVerification === 'public-transcription') group.transcribed++; groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.block.localeCompare(b.block) || a.discipline.localeCompare(b.discipline, 'pt-BR'));
  }, [bank]);

  const load = async () => {
    if (hasDelayedSession) return;
    setBusy(true); setErrors([]); setWarnings([]); setMessage(''); setBank(null); setConfirmed(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(BUNDLED_BANK_URL, { signal: controller.signal, cache: 'no-cache' });
      if (response.status === 404) throw new Error('Esta versão ainda não inclui um pacote de provas anteriores verificadas. Importe seus arquivos oficiais em CSV/JSON ou confira um PDF. Nenhuma questão foi criada ou instalada.');
      if (!response.ok) throw new Error(`Não foi possível carregar o pacote (HTTP ${response.status}). Seu banco e histórico foram preservados.`);
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) throw new Error('O pacote oficial não está disponível nesta instalação. O servidor devolveu uma página, em vez do arquivo JSON. Nenhum item foi instalado.');
      const result = validateQuestionBank(await response.json(), state.topics, state.rules);
      setWarnings(result.warnings);
      if (!result.bank) { setErrors(result.errors); return; }
      setBank(result.bank);
    } catch (cause) {
      setErrors([cause instanceof Error && cause.name === 'AbortError' ? 'O carregamento excedeu 30 segundos. Tente novamente; seus dados foram preservados.' : cause instanceof SyntaxError ? 'O arquivo recebido não é um pacote JSON válido. Nenhuma questão foi instalada.' : cause instanceof Error ? cause.message : 'Falha ao carregar o pacote. Confira sua conexão e tente novamente.']);
    } finally { clearTimeout(timeout); setBusy(false); }
  };

  const install = () => {
    if (!bank || !confirmed || !preview || !preview.added || hasDelayedSession) return;
    try {
      // Recompute against the latest state to tolerate another change during preview.
      update(current => {
        const result = mergeQuestionBank(current, bank);
        return { ...result.state, demoMode: false };
      });
      setMessage(`${preview.added} questões adicionadas ao banco real. ${preview.existing} já existentes foram preservadas. A instalação não registra tentativas nem gera estatísticas de estudo.`);
      setConfirmed(false);
    } catch { setErrors(['Não foi possível instalar o pacote. Confira o aviso de armazenamento e exporte um backup antes de tentar novamente.']); }
  };

  return <section className="card" aria-labelledby="bank-catalog-title">
    <div className="card-heading"><h2 id="bank-catalog-title"><Library size={21} aria-hidden="true"/> Provas anteriores Cebraspe</h2><ShieldCheck size={20} aria-label="Somente fontes identificadas"/></div>
    <p className="muted">Questões oficiais selecionadas por aderência ao conteúdo de CGU · Desenvolvimento de Sistemas. Provas de outros órgãos são identificadas pela origem; não são apresentadas como provas da CGU.</p>
    <p className="caption"><strong>{realCount} questões no banco real.</strong> Quantidade de questões disponíveis não é quantidade resolvida. A instalação começa sem tentativas; os resultados reais aparecem após seu estudo. Exemplos de demonstração permanecem separados.</p>
    <div className="toolbar"><button type="button" className="button button-primary" disabled={busy || hasDelayedSession} onClick={() => { void load(); }}>{busy ? <LoaderCircle size={17} aria-hidden="true"/> : <BookOpenCheck size={17} aria-hidden="true"/>}{busy ? 'Carregando fontes…' : 'Consultar fontes do pacote oficial'}</button></div>
    {hasDelayedSession && <p className="notice" role="status">A prévia, as fontes do gabarito e o download do pacote serão liberados após encerrar as sessões com correção adiada.</p>}
    {errors.length > 0 && <div className="notice notice-warning" role="alert"><div>{errors.slice(0, 12).map((error, index) => <p key={index}>{error}</p>)}{errors.length > 12 && <p>Há mais {errors.length - 12} problemas. O pacote não foi instalado.</p>}</div></div>}
    {message && <div className="notice" role="status"><CheckCircle2 size={18} aria-hidden="true"/><p>{message}</p></div>}
    {bank && preview && !hasDelayedSession && <div className="import-preview">
      <h3>{bank.title}</h3><p className="muted">{bank.description}</p>
      <p className="caption">Versão {bank.version} · Consulta às fontes: {bank.consultedAt.slice(0, 10).split('-').reverse().join('/')} · {bank.questions.length} questões únicas no pacote.</p>
      {coverage && <section className="info-box" aria-labelledby="bank-coverage-title">
        <h4 id="bank-coverage-title">Alcance desta seleção de questões</h4>
        {topicCoverage && <p><strong>{topicCoverage.covered} de {topicCoverage.total} tópicos</strong> do edital de referência do pacote têm pelo menos uma questão selecionada.</p>}
        {disciplineCoverage && <p><strong>{disciplineCoverage.covered} de {disciplineCoverage.total} disciplinas</strong> têm questões nesta seleção.</p>}
        {blockCoverage.length > 0 && <ul aria-label="Quantidade de questões selecionadas por bloco">{blockCoverage.map(([blockId, total]) => <li key={blockId}><strong>{state.rules.blocks.find(block => block.id === blockId)?.name ?? blockId}:</strong> {total} questões</li>)}</ul>}
        {missingDisciplines.length > 0 && <><strong>Disciplinas ainda sem questões no pacote:</strong><ul>{missingDisciplines.map(discipline => <li key={discipline}>{discipline}</li>)}</ul></>}
        <p className="caption">Estes números descrevem a disponibilidade de itens e seu vínculo editorial com o edital. Ter uma questão em um tópico não cobre todo seu conteúdo nem comprova domínio. A seleção é parcial; não representa incidência histórica da banca ou desempenho de Pedro.</p>
      </section>}
      <p className="caption">Ano recente e conferência documental são informações diferentes. O pacote informa por item se o gabarito foi confrontado com um PDF ou obtido de transcrição pública. A vigência atual de toda norma/tecnologia não é certificada. Quantidade disponível não comprova domínio.</p><div className="table-wrap"><table><caption>Distribuição das questões por bloco e disciplina do edital selecionado</caption><thead><tr><th>Bloco</th><th>Disciplina</th><th>Questões</th><th>2025–2026</th><th>Ano mais recente</th><th>Gabaritos transcritos</th></tr></thead><tbody>{grouped.map(group => <tr key={`${group.block}|${group.discipline}`}><td>{state.rules.blocks.find(block => block.id === group.block)?.name ?? group.block}</td><td>{group.discipline}</td><td>{group.count}{group.count < 10 && <small style={{display:"block"}}>Amostra pequena</small>}</td><td>{group.recent}</td><td>{group.newest || "Não informado"}</td><td>{group.transcribed}</td></tr>)}</tbody></table></div>
      <details><summary>Conferir provas, fontes e gabaritos</summary><ul>{sourceLinks.map(source => <li key={source.id} style={{ overflowWrap: 'anywhere' }}><a href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={12} aria-hidden="true"/></a><div className="toolbar">{source.assetUrl && <a href={source.assetUrl} target="_blank" rel="noreferrer">Abrir cópia PDF conferida <ExternalLink size={12} aria-hidden="true"/></a>}{source.mirrorUrl && <a href={source.mirrorUrl} target="_blank" rel="noreferrer">Consultar espelho público <ExternalLink size={12} aria-hidden="true"/></a>}</div><p className="caption">{source.detail}</p></li>)}</ul></details>
      <details><summary>Conferir itens e vínculo com o edital</summary><div className="preview-scroll">{bank.questions.map(question => <article key={question.id} className="preview-item"><strong>{question.organization} · {question.year} · Item {question.itemNumber ?? question.id}</strong><p className="caption">{question.discipline} → {question.topic} · {question.topicId}</p><QuestionStatement statement={question.statement} code={question.code} language={question.language} question={question}/><p className="caption">Gabarito {question.keyStatus === 'annulled' ? 'anulado' : question.answer === 'C' ? 'Certo' : 'Errado'} · versão {question.keyVersion} · {question.explanation?.validated ? 'Comentário validado com referência' : 'Sem comentário validado'}</p><a href={question.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte original</a></article>)}</div></details>
      {(warnings.length > 0 || preview.conflicts.length > 0) && <div className="info-box"><strong>Cuidados da instalação</strong>{[...warnings, ...preview.conflicts].slice(0, 15).map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      <p><strong>{preview.added} novas questões</strong> · {preview.existing} já existentes. Itens existentes, favoritos, gabaritos retificados, anotações e histórico serão preservados.</p>
      {preview.added > 0 ? <><label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Conferi as fontes, o escopo das disciplinas e a identificação dos gabaritos.</label><div className="toolbar"><button className="button button-primary" type="button" disabled={!confirmed || busy} onClick={install}><Download size={16} aria-hidden="true"/>Adicionar {preview.added} questões ao banco real</button></div></> : <p className="notice" role="status">As {preview.existing} questões deste pacote já estão presentes no banco. Nenhum item existente foi substituído.</p>}
      <div className="toolbar"><button className="button button-secondary" type="button" onClick={() => { if (!hasDelayedSession) downloadFile(`${bank.id}.json`, JSON.stringify(bank, null, 2)); }}><Download size={16} aria-hidden="true"/>Baixar pacote JSON</button></div>
    </div>}
  </section>;
}
