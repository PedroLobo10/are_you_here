import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileCheck2, FileText, Info, Plus, Search, ShieldAlert, Trash2, Upload } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { BlockRule, DiscursiveRules, ExamRules, ModuleProps, SourceRecord, Topic } from '../types';
import { deriveTopicStats, getPriority } from '../core';
import { saveDocument } from '../documents';
import DocumentPreview from './DocumentPreview';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const statuses: Record<Topic['status'], string> = { 'not-started': 'Não iniciado', studying: 'Em estudo', reviewing: 'Em revisão', consolidated: 'Consolidado' };
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
const percentage = (value: number | null) => value === null ? 'Sem dados' : `${(value * 100).toFixed(1)}%`;
const dateLabel = (value?: string | null) => value ? new Date(value.includes('T') ? value : `${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function download(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV quotation is handled explicitly: separators inside quoted cells are retained.
function parseCsv(text: string): Record<string, string>[] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contém aspas não fechadas. Confira o arquivo.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift()?.map(v => v.trim()) ?? [];
  if (!headers.length) throw new Error('O CSV está vazio.');
  return rows.map(values => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ''])));
}

function PdfPreview({ data }: { data: Uint8Array }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ data: data.slice() });
    let renderTask: ReturnType<pdfjs.PDFPageProxy['render']> | undefined;
    void task.promise.then(async document => {
      if (cancelled) return;
      setPageCount(document.numPages);
      const page = await document.getPage(Math.min(pageNumber, document.numPages));
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = canvasRef.current; const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width; canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    }).catch(cause => { if (!cancelled) setError(`Não foi possível renderizar a página: ${String(cause)}`); });
    return () => { cancelled = true; renderTask?.cancel(); void task.destroy(); };
  }, [data, pageNumber]);
  return <div className="pdf-preview">
    <div className="toolbar"><strong>Documento original</strong><div className="button-group"><button className="button secondary" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber === 1} aria-label="Página anterior"><ChevronLeft size={16}/></button><span>Página {pageNumber} de {pageCount || '…'}</span><button className="button secondary" onClick={() => setPageNumber(p => Math.min(pageCount, p + 1))} disabled={!pageCount || pageNumber >= pageCount} aria-label="Próxima página"><ChevronRight size={16}/></button></div></div>
    {error && <p className="alert warning" role="alert">{error}</p>}
    <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '16px auto', background: 'white' }} aria-label={`Página ${pageNumber} do PDF: prévia original para conferência visual`} />
    <p className="muted small">A prévia renderiza o original e mantém imagens, tabelas e códigos. O texto extraído precisa de conferência humana. O PDF é preservado neste navegador e incluído no backup completo.</p>
  </div>;
}

export function Syllabus({ state, update }: ModuleProps) {
  const delayedSession=state.sessions.some(s=>s.status==='active'&&['simulation','battery','diagnostic'].includes(s.mode));
  const visibleSources=state.sources.filter(source=>!delayedSession||!['key','keyChanges'].includes(source.questionBankDocumentKind||''));
  const [tab, setTab] = useState<'topics' | 'sources' | 'rules'>('topics');
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [textPreview, setTextPreview] = useState('');
  const [draft, setDraft] = useState<ExamRules>(() => structuredClone(state.rules));
  const [sourceId, setSourceId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [pendingTopics, setPendingTopics] = useState<Topic[]>([]);
  const [topicSourceName, setTopicSourceName] = useState('');
  const pdfInput = useRef<HTMLInputElement>(null);
  const topicsInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(structuredClone(state.rules)); setAcknowledged(false); }, [state.rules]);

  const realTopics = state.topics;
  const topicStats = realTopics.map(topic => ({ topic, stats: deriveTopicStats(state, topic.id, false), priority: getPriority(state, topic, false) }));
  const visibleTopics = topicStats.filter(({ topic }) => (!query || `${topic.discipline} ${topic.name} ${topic.subtopic || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))) && (!discipline || topic.discipline === discipline) && (!statusFilter || topic.status === statusFilter));
  const studied = topicStats.filter(({ stats }) => stats.uniqueValid > 0).length;
  const confirmedSources = state.sources.filter(source => !source.questionBankDocumentKind && (source.status === 'uploaded' || source.status === 'verified'));

  async function uploadPdf(file?: File) {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Use um PDF de até 25 MB por documento. Você pode anexar edital e retificações separadamente.');
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjs.getDocument({ data: data.slice() });
      const document = await task.promise;
      if (document.numPages > 250) { await document.destroy(); throw new Error('Limite de 250 páginas por arquivo. Divida o documento conservando as páginas relevantes e a identificação.'); }
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        pages.push(`PÁGINA ${pageNumber}\n${text}`);
      }
      await document.destroy();
      const extractedText = pages.join('\n\n');
      const documentId = await saveDocument(file);
      const record: SourceRecord = { id: `source-${crypto.randomUUID()}`, title: file.name, fileName: file.name, documentId, url: state.rules.sourceUrl, consultedAt: today(), status: 'uploaded', extractedText, detail: 'PDF anexado pelo usuário. Extração e origem ainda precisam de conferência; conteúdo, versão, retificações e especialidade não foram validados automaticamente.' };
      update(prev => ({ ...prev, sources: [...prev.sources, record] }));
      setSourceId(record.id); setPdfData(data); setTextPreview(extractedText); setTab('sources');
      setMessage(extractedText.replace(/PÁGINA\s+\d+/g, '').trim().length < 30 ? 'Documento anexado. Há pouco texto extraível: pode ser um PDF digitalizado. Confira a prévia; OCR automático não está disponível. As regras continuam pendentes.' : 'Documento anexado e texto extraído. Confira a prévia e suas retificações; nenhuma regra foi confirmada automaticamente.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Falha ao abrir o PDF. Confira se o arquivo é válido e não está protegido por senha.'); }
    finally { setBusy(false); if (pdfInput.current) pdfInput.current.value = ''; }
  }

  async function previewTopics(file?: File) {
    if (!file) return;
    setMessage('');
    try {
      const text = await file.text();
      const parsed: unknown = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
      const rows: unknown = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'topics' in parsed ? (parsed as { topics: unknown }).topics : null;
      if (!Array.isArray(rows) || !rows.length) throw new Error('Informe uma lista de tópicos ou um objeto {"topics": [...]} não vazio.');
      const ids = new Set(state.topics.map(topic => topic.id));
      const topics = rows.map((row: unknown, index: number): Topic => {
        if (!row || typeof row !== 'object') throw new Error(`Linha ${index + 1}: tópico inválido.`);
        const record = row as Record<string, unknown>;
        const id = String(record.id || '').trim(); const name = String(record.name || '').trim(); const topicDiscipline = String(record.discipline || '').trim(); const block = String(record.block || '').trim();
        if (!id || !name || !topicDiscipline || !block) throw new Error(`Linha ${index + 1}: id, discipline, name e block são obrigatórios.`);
        if (ids.has(id)) throw new Error(`Linha ${index + 1}: id duplicado (${id}). Os tópicos existentes foram preservados.`);
        if (!state.rules.blocks.some(rule => rule.id === block)) throw new Error(`Linha ${index + 1}: o bloco ${block} não está configurado. Cadastre-o em Regras de prova.`);
        ids.add(id);
        const difficulty = Number(record.difficulty || 3);
        if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 5) throw new Error(`Linha ${index + 1}: dificuldade deve estar entre 1 e 5.`);
        return { id, discipline: topicDiscipline, name, subtopic: record.subtopic ? String(record.subtopic) : undefined, block, status: 'not-started', difficulty, verified: false, evidence: 'Tópico importado pelo usuário; vínculo com edital e retificações ainda não confirmado.' };
      });
      setPendingTopics(topics); setTopicSourceName(file.name);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo de tópicos.'); }
    finally { if (topicsInput.current) topicsInput.current.value = ''; }
  }

  function confirmTopics() {
    update(prev => ({ ...prev, topics: [...prev.topics, ...pendingTopics], sources: [...prev.sources, { id: `topics-${crypto.randomUUID()}`, title: `Mapa de tópicos: ${topicSourceName}`, fileName: topicSourceName, url: '', consultedAt: today(), status: 'uploaded', detail: 'Taxonomia importada manualmente em CSV/JSON. Não equivale a edital oficial verificado.' }] }));
    setPendingTopics([]); setMessage('Tópicos importados como provisórios. Vincule questões aos itens e confirme o conteúdo com o edital.');
  }

  function updateBlock(index: number, values: Partial<BlockRule>) { setDraft(current => ({ ...current, blocks: current.blocks.map((block, i) => i === index ? { ...block, ...values } : block) })); }

  function updateWriting(values: Partial<DiscursiveRules>) {
    setDraft(current => current.writingConfig ? { ...current, writingConfig: { ...current.writingConfig, ...values } } : current);
  }

  function updateWritingPart(index: number, values: Partial<DiscursiveRules['parts'][number]>) {
    setDraft(current => current.writingConfig ? { ...current, writingConfig: { ...current.writingConfig, parts: current.writingConfig.parts.map((part, i) => i === index ? { ...part, ...values } : part) } } : current);
  }

  function saveRules() {
    setMessage('');
    try {
      if (!draft.version.trim() || !draft.specialty.trim()) throw new Error('Preencha a versão e a especialidade.');
      if (!draft.blocks.length) throw new Error('Cadastre pelo menos um bloco.');
      if (new Set(draft.blocks.map(block => block.id)).size !== draft.blocks.length) throw new Error('Os identificadores dos blocos devem ser únicos.');
      for (const block of draft.blocks) {
        if (!block.id.trim() || !block.name.trim()) throw new Error('Todo bloco precisa de identificador e nome.');
        if (block.gain <= 0 || block.penalty < 0 || !Number.isFinite(block.gain) || !Number.isFinite(block.penalty) || !Number.isFinite(block.omission)) throw new Error('Ganho deve ser positivo, penalidade deve ser não negativa e todas as pontuações devem ser números finitos.');
        if (block.items !== null && (!Number.isInteger(block.items) || block.items <= 0)) throw new Error('Quantidade de itens deve ser inteira e positiva, ou permanecer vazia enquanto desconhecida.');
        if (block.minimum !== null && (!Number.isFinite(block.minimum) || (block.items !== null && block.minimum > block.items * block.gain))) throw new Error('Confira o mínimo de cada bloco; ele não pode superar a pontuação máxima conhecida.');
      }
      if (draft.durationMinutes !== null && (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes <= 0)) throw new Error('A duração deve ser positiva ou permanecer vazia enquanto desconhecida.');
      if (draft.totalMinimum !== null && !Number.isFinite(draft.totalMinimum)) throw new Error('Mínimo total inválido.');
      if (draft.dates.some(date => !date.label.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.date))) throw new Error('Preencha nome e data dos eventos adicionados.');
      if (draft.writingConfig) {
        const writing = draft.writingConfig;
        if (!Number.isFinite(writing.durationMinutes) || writing.durationMinutes <= 0) throw new Error('A duração da discursiva deve ser positiva.');
        if (!writing.parts.length || new Set(writing.parts.map(part => part.id)).size !== writing.parts.length) throw new Error('A discursiva precisa de partes com identificadores únicos.');
        for (const part of writing.parts) {
          if (!['q1', 'q2'].includes(part.id) || !part.label.trim() || !part.section.trim()) throw new Error('Preencha o nome e a seção de origem de cada parte discursiva.');
          if (!Number.isFinite(part.maximum) || part.maximum <= 0) throw new Error('A pontuação máxima de cada parte discursiva deve ser positiva.');
          if (!Number.isInteger(part.maximumLines) || part.maximumLines <= 0) throw new Error('O limite oficial de linhas deve ser inteiro e positivo.');
          if (!Number.isFinite(part.languagePenalty) || part.languagePenalty < 0) throw new Error('O coeficiente de penalidade linguística deve ser não negativo.');
        }
        if (!Number.isFinite(writing.minimum) || writing.minimum < 0 || writing.minimum > writing.parts.reduce((total, part) => total + part.maximum, 0)) throw new Error('O mínimo discursivo deve estar entre zero e a soma das pontuações máximas.');
      }
      const evidence = state.sources.find(source => source.id === sourceId);
      if (acknowledged) {
        if (!evidence || evidence.status === 'unavailable' || !evidence.fileName?.toLowerCase().endsWith('.pdf')) throw new Error('Para confirmar regras oficiais, anexe o PDF do edital e selecione a fonte.');
        if (/provisor|pendente|objetivo pessoal/i.test(draft.version + ' ' + draft.specialty)) throw new Error('Informe a versão do documento e o nome oficial da especialidade que você conferiu.');
        if (draft.durationMinutes === null || draft.blocks.some(block => block.items === null)) throw new Error('Confirme a duração e as quantidades de itens de todos os blocos antes de validar a estrutura oficial.');
        if (!draft.writingRules.trim() || /ainda não verificad|ainda não confirmado/i.test(draft.writingRules)) throw new Error('Descreva as regras discursivas conferidas no documento, ou informe expressamente que não há discursiva.');
      }
      const version = draft.version === state.rules.version ? `${draft.version} · revisão ${new Date().toISOString()}` : draft.version.trim();
      const rules: ExamRules = { ...structuredClone(draft), version, verified: acknowledged, consultedAt: today(), sourceName: evidence?.title || draft.sourceName, sourceUrl: draft.sourceUrl.trim() || evidence?.url || '', dates: draft.dates.map(date => ({ ...date, verified: acknowledged })) };
      if (rules.writingConfig) rules.writingConfig = { ...rules.writingConfig, version, sourceName: rules.sourceName, sourceUrl: rules.sourceUrl, consultedAt: rules.consultedAt, verified: rules.verified };
      update(prev => ({ ...prev, rules, sources: prev.sources.map(source => acknowledged && source.id === sourceId ? { ...source, status: 'verified', url: rules.sourceUrl, detail: `${source.detail} Regras conferidas manualmente pelo usuário em ${today()}; versão ${version}.` } : source) }));
      setMessage(acknowledged ? 'Regras salvas como conferidas manualmente. As sessões anteriores preservam sua própria versão de cálculo.' : 'Configuração provisória salva. As sessões anteriores preservam sua própria versão de cálculo.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar as regras.'); }
  }

  return <div className="syllabus-page page-content">
    <div className="page-heading"><div><div className="eyebrow">SEU MAPA DE ESTUDO</div><h1>Edital verticalizado</h1><p className="muted">Conteúdo, evidências de domínio e regras da prova em um só lugar.</p></div><button className="button primary" disabled={busy} onClick={() => pdfInput.current?.click()}><Upload size={17}/> {busy ? 'Lendo documento…' : 'Anexar edital PDF'}</button></div>
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={event => void uploadPdf(event.target.files?.[0])}/>
    <input ref={topicsInput} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={event => void previewTopics(event.target.files?.[0])}/>

    {!state.rules.verified && <div className="alert warning"><ShieldAlert size={21}/><div><strong>Regras oficiais aguardando conferência</strong><p>Não foi possível consultar o edital pela rede deste ambiente. A especialidade oficial, conteúdo, pesos, mínimos, duração e datas permanecem pendentes. O treino +1 / −1 é provisório; anexe o edital e as retificações para configurá-los.</p></div></div>}
    {state.rules.verified && <div className="alert success"><FileCheck2 size={20}/><div><strong>Regras conferidas no documento</strong><p>{state.rules.specialty} · versão {state.rules.version} · fonte: {state.rules.sourceName}. Conferência registrada em {dateLabel(state.rules.consultedAt)}.</p>{state.rules.sourceName.includes('PDF fornecido') && <p className="small">Conteúdo do PDF fornecido pelo usuário. Publicação oficial, vigência e retificações não confirmadas online.</p>}</div></div>}
    {message && <div className="alert info" role="status"><Info size={18}/><p>{message}</p></div>}
    <div className="stats-grid syllabus-summary"><div className="card stat-card"><span>Tópicos cadastrados</span><strong>{realTopics.length}</strong><small>{realTopics.filter(topic => topic.verified).length} com fonte conferida</small></div><div className="card stat-card"><span>Contato com o conteúdo</span><strong>{realTopics.length ? `${Math.round(studied / realTopics.length * 100)}%` : '—'}</strong><small>{studied} tópicos com respostas reais julgáveis</small></div><div className="card stat-card"><span>Consolidados</span><strong>{realTopics.filter(topic => topic.status === 'consolidated').length}</strong><small>Exigem evidências de retenção</small></div></div>
    <div className="tabs" role="tablist" aria-label="Seções do edital"><button role="tab" aria-selected={tab === 'topics'} className={tab === 'topics' ? 'active' : ''} onClick={() => setTab('topics')}><BookOpen size={16}/> Conteúdo</button><button role="tab" aria-selected={tab === 'sources'} className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><FileText size={16}/> Fontes e documentos</button><button role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}><CalendarDays size={16}/> Regras de prova</button></div>

    {tab === 'topics' && <section role="tabpanel">
      <div className="card"><div className="toolbar"><div className="search-box"><Search size={16}/><input aria-label="Buscar conteúdo do edital" placeholder="Buscar disciplina, assunto ou subassunto" value={query} onChange={event => setQuery(event.target.value)}/></div><select aria-label="Filtrar disciplina do edital" value={discipline} onChange={event => setDiscipline(event.target.value)}><option value="">Todas as disciplinas</option>{[...new Set(realTopics.map(topic => topic.discipline))].map(name => <option key={name}>{name}</option>)}</select><select aria-label="Filtrar situação de estudo" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todas as situações</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="toolbar" style={{ marginTop: 12 }}><span className="muted small">O conteúdo real é separado dos exemplos demonstrativos.</span><div className="button-group"><button className="button secondary" onClick={() => download('modelo-edital-cgu.csv', 'id,discipline,name,subtopic,block,difficulty\n"item-do-documento","Disciplina conforme edital","Assunto conforme edital","Subassunto conforme edital","general",3\n', 'text/csv;charset=utf-8')}><Download size={15}/> Modelo CSV</button><button className="button secondary" onClick={() => topicsInput.current?.click()}><Upload size={15}/> Importar tópicos</button></div></div></div>
      {pendingTopics.length > 0 && <div className="card"><h3>Confira antes de importar</h3><p>{pendingTopics.length} tópicos de <strong>{topicSourceName}</strong>. Entrarão como não iniciados e com fonte pendente, independentemente do status informado no arquivo.</p><div className="table-wrap"><table><thead><tr><th>Disciplina</th><th>Assunto</th><th>Subassunto</th><th>Bloco</th></tr></thead><tbody>{pendingTopics.map(topic => <tr key={topic.id}><td>{topic.discipline}</td><td>{topic.name}</td><td>{topic.subtopic || '—'}</td><td>{topic.block}</td></tr>)}</tbody></table></div><div className="button-group"><button className="button primary" onClick={confirmTopics}>Importar {pendingTopics.length} tópicos</button><button className="button secondary" onClick={() => setPendingTopics([])}>Cancelar</button></div></div>}
      {!realTopics.length ? <div className="card empty-state"><div className="empty-icon"><BookOpen size={32}/></div><h2>Seu mapa começa no edital</h2><p>Não há conteúdo oficial confirmado. Anexe o PDF e as retificações; depois confira e importe os itens. Os exemplos do laboratório não representam disciplinas do concurso.</p><button className="button primary" onClick={() => pdfInput.current?.click()}><Upload size={16}/> Anexar documento oficial</button><p className="muted small">Formato do mapa: id, discipline, name, subtopic, block, difficulty. Cada bloco deve existir em Regras de prova.</p></div> : visibleTopics.length ? <div className="topic-list">{visibleTopics.map(({ topic, stats, priority }) => <article className="card topic-card" key={topic.id}>
        <div className="toolbar"><div><div className="eyebrow">{topic.discipline} · {state.rules.blocks.find(block => block.id === topic.block)?.name || topic.block}</div><h3>{topic.name}</h3>{topic.subtopic && <p className="muted">{topic.subtopic}</p>}</div><span className="badge">{priority.label}</span></div>
        <div className="topic-metrics"><span><strong>{stats.unique}</strong> questões únicas reais</span><span><strong>{stats.attempts}</strong> tentativas</span><span><strong>{stats.novelAttempts}</strong> inéditas respondidas</span><span>Precisão <strong>{percentage(stats.precision)}</strong></span><span>Líquido <strong>{percentage(stats.netRate)}</strong></span></div>
        <div className="toolbar"><label className="inline-field">Situação <select value={topic.status} onChange={event => {
          const value = event.target.value as Topic['status'];
          if (value === 'consolidated' && !priority.canConsolidate) { setMessage(`Não há evidências suficientes para consolidar ${topic.name}. ${priority.evidence.join(' ')}`); return; }
          update(prev => ({ ...prev, topics: prev.topics.map(current => current.id === topic.id ? { ...current, status: value } : current) }));
        }}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value} disabled={value === 'consolidated' && !priority.canConsolidate}>{label}</option>)}</select></label><label className="inline-field">Dificuldade percebida <select value={topic.difficulty} onChange={event => update(prev => ({ ...prev, topics: prev.topics.map(current => current.id === topic.id ? { ...current, difficulty: Number(event.target.value) } : current) }))}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label><button className="button secondary" aria-expanded={expanded === topic.id} onClick={() => setExpanded(expanded === topic.id ? null : topic.id)}>Evidências e revisões</button></div>
        {expanded === topic.id && <div className="topic-evidence"><div className="two-column"><div><h4>Por que estudar este assunto</h4><ul>{priority.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><p className="muted small">Peso: {topic.weight !== undefined ? topic.weight : 'não documentado'} · Frequência histórica: não calculada sem uma base identificada.</p></div><div><h4>Evidências de domínio</h4><ul>{priority.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul><p>Último estudo: {dateLabel(stats.lastStudy || topic.lastStudy)}<br/>Última revisão: {dateLabel(stats.lastReview)}<br/>Próxima revisão: {dateLabel(stats.nextReview || topic.nextReview)}</p></div></div><p className="muted small">Um assunto não é consolidado por poucos acertos. O critério exige amostra, precisão, desempenho líquido e revisões posteriores, conforme as evidências acima.</p><label className="checkbox"><input type="checkbox" checked={topic.verified} onChange={event => {
          if (event.target.checked && (!state.rules.verified || !confirmedSources.some(source => source.status === 'verified' || Boolean(source.assetUrl)))) { setMessage('Confirme primeiro o documento oficial e suas regras em Regras de prova. O tópico permanece provisório.'); return; }
          update(prev => ({ ...prev, topics: prev.topics.map(current => current.id === topic.id ? { ...current, verified: event.target.checked, evidence: event.target.checked ? `Vínculo com ${state.rules.sourceName}, versão ${state.rules.version}, conferido manualmente pelo usuário.` : 'Vínculo com edital não confirmado.' } : current) }));
        }}/> Conferi o vínculo deste tópico com o edital e as retificações.</label>{topic.evidence && <p className="muted small">{topic.evidence}</p>}</div>}
      </article>)}</div> : <div className="card empty-state"><h3>Nenhum tópico corresponde aos filtros</h3><button className="button secondary" onClick={() => { setQuery(''); setDiscipline(''); setStatusFilter(''); }}>Limpar filtros</button></div>}
    </section>}

    {tab === 'sources' && <section role="tabpanel"><div className="card"><h2>O documento vem antes da regra</h2><p className="muted">Guarde o edital vigente e todas as retificações. Um arquivo anexado é uma fonte a conferir; a extração de texto não valida regras de prova.</p><div className="source-list">{visibleSources.map(source => <div className="source-row" key={source.id}><FileText size={23}/><div><strong>{source.title}</strong><div className="small muted">Consulta: {dateLabel(source.consultedAt)} · {source.status === 'verified' ? 'Conferido manualmente' : source.status === 'uploaded' ? (source.assetUrl ? 'PDF fornecido; conteúdo conferido, atualização online pendente' : 'Anexado; aguarda conferência') : 'Acesso indisponível'}</div><p>{source.detail}</p>{source.url && <a className="text-link" href={source.url} target="_blank" rel="noreferrer">Abrir fonte <ExternalLink size={13}/></a>}{source.assetUrl && <details className="original-document"><summary>{source.questionBankDocumentKind ? 'Conferir PDF original da prova / gabarito' : 'Conferir PDF fornecido'} · imagens, tabelas e códigos originais</summary><iframe title={source.title} src={`${source.assetUrl}#page=1`} style={{width:'100%',height:550,border:'1px solid var(--border)',borderRadius:12}}/><a className="text-link" href={source.assetUrl} target="_blank" rel="noreferrer">{source.questionBankDocumentKind ? 'Abrir PDF original' : 'Abrir PDF fornecido'} <ExternalLink size={13}/></a></details>}{source.documentId && <DocumentPreview documentId={source.documentId}/>} {source.extractedText && <button className="button secondary" onClick={() => { setTextPreview(source.extractedText || ''); setSourceId(source.id); }}>Consultar texto extraído</button>}</div></div>)}</div></div>{pdfData && <div className="card"><PdfPreview data={pdfData}/></div>}{textPreview && <div className="card"><div className="toolbar"><h3>Texto extraído · confira com o original</h3><button className="button secondary" onClick={() => download('texto-edital-para-conferencia.txt', textPreview, 'text/plain;charset=utf-8')}><Download size={15}/> Exportar texto</button></div><p className="muted small">A leitura linear pode alterar a ordem de colunas, fórmulas, tabelas e códigos. Nada deste texto foi convertido automaticamente em regra oficial.</p><pre className="document-text" style={{ whiteSpace: 'pre-wrap', maxHeight: 460, overflow: 'auto', fontFamily: 'inherit', fontSize: 13 }}>{textPreview}</pre><button className="button primary" onClick={() => setTab('rules')}>Configurar regras após conferir</button></div>}</section>}

    {tab === 'rules' && <section role="tabpanel"><div className="card"><div className="toolbar"><div><h2>Estrutura e pontuação</h2><p className="muted">Os campos vazios significam informação desconhecida ou não aplicável; descreva isso nas notas.</p></div><button className="button secondary" onClick={() => download('regras-cgu.json', JSON.stringify(state.rules, null, 2))}><Download size={16}/> Exportar regras</button></div><div className="form-grid"><label>Nome oficial da especialidade<input value={draft.specialty} onChange={event => setDraft(current => ({ ...current, specialty: event.target.value }))}/></label><label>Versão do edital / retificação<input value={draft.version} onChange={event => setDraft(current => ({ ...current, version: event.target.value }))}/></label><label>Fonte principal<select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Selecione um documento anexado</option>{confirmedSources.map(source => <option value={source.id} key={source.id}>{source.title}</option>)}</select></label><label>URL da fonte<input type="url" value={draft.sourceUrl} onChange={event => setDraft(current => ({ ...current, sourceUrl: event.target.value }))}/></label><label>Duração total da prova (minutos)<input type="number" min="1" placeholder="Não verificada" value={draft.durationMinutes ?? ''} onChange={event => setDraft(current => ({ ...current, durationMinutes: numberOrNull(event.target.value) }))}/></label><label>Mínimo eliminatório total<input type="number" step="any" placeholder="Não verificado / não aplicável" value={draft.totalMinimum ?? ''} onChange={event => setDraft(current => ({ ...current, totalMinimum: numberOrNull(event.target.value) }))}/></label></div><p className="muted small">Mínimos eliminatórios são requisitos da prova. Não representam nota de corte, classificação ou chance de aprovação.</p></div>
      {draft.blocks.map((block, index) => <div className="card" key={index}><div className="toolbar"><h3>Bloco {index + 1}</h3><button className="button secondary" aria-label={`Remover bloco ${block.name}`} disabled={draft.blocks.length === 1 || (state.questions.some(question => !question.isDemo && question.block === block.id) || state.topics.some(topic => topic.block === block.id))} title="Blocos com questões vinculadas são preservados" onClick={() => setDraft(current => ({ ...current, blocks: current.blocks.filter((_, i) => i !== index) }))}><Trash2 size={16}/></button></div><div className="form-grid"><label>Identificador<input value={block.id} disabled={(state.questions.some(question => !question.isDemo && question.block === block.id) || state.topics.some(topic => topic.block === block.id))} onChange={event => updateBlock(index, { id: event.target.value })}/></label><label>Nome do bloco<input value={block.name} onChange={event => updateBlock(index, { name: event.target.value })}/></label><label>Quantidade de itens<input type="number" min="1" step="1" value={block.items ?? ''} placeholder="Não verificada" onChange={event => updateBlock(index, { items: numberOrNull(event.target.value) })}/></label><label>Pontos por acerto<input type="number" min="0" step="any" value={block.gain} onChange={event => updateBlock(index, { gain: Number(event.target.value) })}/></label><label>Penalidade por erro (magnitude)<input type="number" min="0" step="any" value={block.penalty} onChange={event => updateBlock(index, { penalty: Number(event.target.value) })}/></label><label>Pontos por omissão<input type="number" step="any" value={block.omission} onChange={event => updateBlock(index, { omission: Number(event.target.value) })}/></label><label>Mínimo eliminatório do bloco<input type="number" step="any" value={block.minimum ?? ''} placeholder="Não verificado / não aplicável" onChange={event => updateBlock(index, { minimum: numberOrNull(event.target.value) })}/></label><label>Tratamento do item anulado<select value={block.annulled} onChange={event => updateBlock(index, { annulled: event.target.value as BlockRule['annulled'] })}><option value="exclude">Excluir do cálculo e do denominador</option><option value="award">Atribuir o ganho a todos</option></select></label></div><p className="small muted">Pontos = acertos × {block.gain} − erros × {block.penalty} + brancos × {block.omission}. A versão utilizada fica registrada em cada sessão.</p></div>)}
      <button className="button secondary" onClick={() => setDraft(current => ({ ...current, blocks: [...current.blocks, { id: `bloco-${crypto.randomUUID().slice(0, 8)}`, name: 'Novo bloco (conferir documento)', items: null, gain: 1, penalty: 1, omission: 0, minimum: null, annulled: 'exclude' }] }))}><Plus size={16}/> Adicionar bloco</button>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="toolbar"><div><h3>Estrutura e cálculo da discursiva</h3><p className="muted">Confira a estrutura numérica e a descrição textual com o mesmo documento.</p></div>{draft.writingConfig && <button className="button secondary" onClick={() => setDraft(current => ({ ...current, writingConfig: undefined }))}>Remover estrutura discursiva</button>}</div>
        {!draft.writingConfig ? <><p className="muted">Nenhuma fórmula discursiva estruturada foi configurada. O texto das regras não cria uma fórmula automaticamente.</p><button className="button secondary" onClick={() => setDraft(current => ({ ...current, writingConfig: { version: current.version, sourceName: current.sourceName, sourceUrl: current.sourceUrl, consultedAt: current.consultedAt, verified: false, durationMinutes: 0, minimum: 0, parts: [{ id: 'q1', label: 'Questão 1', maximum: 0, maximumLines: 0, languagePenalty: 0, section: '' }, { id: 'q2', label: 'Questão 2', maximum: 0, maximumLines: 0, languagePenalty: 0, section: '' }] } }))}><Plus size={16}/> Configurar estrutura discursiva</button></> : <>
          <div className="form-grid"><label>Duração da discursiva (minutos)<input type="number" min="1" step="any" value={draft.writingConfig.durationMinutes || ''} placeholder="Conferir no documento" onChange={event => updateWriting({ durationMinutes: Number(event.target.value) })}/></label><label>Mínimo eliminatório da discursiva<input type="number" min="0" step="any" value={draft.writingConfig.minimum} onChange={event => updateWriting({ minimum: Number(event.target.value) })}/></label></div>
          {draft.writingConfig.parts.map((part, index) => <fieldset key={part.id} style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}><legend>{part.id.toUpperCase()} · {part.label}</legend><div className="form-grid"><label>Nome da parte {part.id.toUpperCase()}<input value={part.label} onChange={event => updateWritingPart(index, { label: event.target.value })}/></label><label>Seção do documento para {part.id.toUpperCase()}<input value={part.section} placeholder="Item do edital / retificação" onChange={event => updateWritingPart(index, { section: event.target.value })}/></label><label>Pontuação máxima de {part.id.toUpperCase()}<input type="number" min="0" step="any" value={part.maximum || ''} onChange={event => updateWritingPart(index, { maximum: Number(event.target.value) })}/></label><label>Limite oficial de linhas de {part.id.toUpperCase()}<input type="number" min="1" step="1" value={part.maximumLines || ''} onChange={event => updateWritingPart(index, { maximumLines: Number(event.target.value) })}/></label><label>Coeficiente de penalidade linguística de {part.id.toUpperCase()}<input type="number" min="0" step="any" value={part.languagePenalty} onChange={event => updateWritingPart(index, { languagePenalty: Number(event.target.value) })}/></label></div><p className="small muted">{part.id.toUpperCase()} = max(0, NC − {part.languagePenalty} × NE ÷ TL); NC limitada a {part.maximum || 'máximo a conferir'} pontos. Sem texto ou fuga ao tema: zero. O limite de {part.maximumLines || 'linhas a conferir'} linhas se refere à folha oficial.</p></fieldset>)}
          <p className="small muted">A descrição textual das regras não altera estes coeficientes. Retificações exigem conferir e atualizar ambos. Ao salvar, fonte, versão, data e situação da conferência são atualizadas juntos; respostas discursivas anteriores preservam suas regras de cálculo.</p>
        </>}
      </div>
      <div className="card" style={{ marginTop: 20 }}><h3>Datas e organização da prova</h3>{!draft.dates.length && <p className="muted">Nenhuma data foi verificada. Cadastre apenas eventos presentes na fonte.</p>}{draft.dates.map((date, index) => <div className="toolbar" key={index}><label>Evento<input value={date.label} onChange={event => setDraft(current => ({ ...current, dates: current.dates.map((value, i) => i === index ? { ...value, label: event.target.value } : value) }))}/></label><label>Data<input type="date" value={date.date} onChange={event => setDraft(current => ({ ...current, dates: current.dates.map((value, i) => i === index ? { ...value, date: event.target.value } : value) }))}/></label><button className="button secondary" aria-label={`Remover evento ${date.label}`} onClick={() => setDraft(current => ({ ...current, dates: current.dates.filter((_, i) => i !== index) }))}><Trash2 size={16}/></button></div>)}<button className="button secondary" onClick={() => setDraft(current => ({ ...current, dates: [...current.dates, { label: '', date: '', verified: false }] }))}><Plus size={16}/> Adicionar evento</button><label className="field" style={{ marginTop: 18 }}>Regras discursivas<textarea rows={5} value={draft.writingRules} onChange={event => setDraft(current => ({ ...current, writingRules: event.target.value }))}/></label><label className="field">Notas de organização, fontes e retificações<textarea rows={4} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}/></label><div className="alert info"><Info size={18}/><p>Especifique blocos, duração, ordem das provas e regras de discursiva conforme o documento. Não use a contagem de linhas da tela como equivalente à folha oficial.</p></div><label className="checkbox"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/> Conferi o PDF do edital vigente e suas retificações: especialidade, itens, pontuação, mínimos, duração, datas e discursivas. Os valores desta configuração vêm desses documentos.</label><div className="button-group" style={{ marginTop: 20 }}><button className="button primary" onClick={saveRules}>{acknowledged ? <CheckCircle2 size={17}/> : <FileText size={17}/>} {acknowledged ? 'Salvar regras conferidas' : 'Salvar como provisórias'}</button><button className="button secondary" onClick={() => { setDraft(structuredClone(state.rules)); setAcknowledged(false); }}>Restaurar campos salvos</button></div></div>
    </section>}
  </div>;
}

export default Syllabus;
