import { useEffect, useState } from 'react';
import { PenLine, Plus, Play, Pause, Save, Download, FileText, AlertTriangle } from 'lucide-react';
import type { ModuleProps, Writing as WritingRecord } from '../types';
import { localDay } from '../planner';
import { downloadFile } from '../storage';

function formatTime(minutes: number) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function calculateWritingScore(writing: WritingRecord): { score: number | null; raw: number | null; message: string } {
  const part = writing.scoringRules?.parts.find(part => part.id === writing.kind);
  if (!writing.scoringRules?.verified || !part) return { score: null, raw: null, message: 'Sem regra documental vinculada a este texto.' };
  if (writing.zeroReason === 'off-topic') return { score: 0, raw: 0, message: 'Fuga ao tema informada: nota zero, conforme o documento.' };
  if (writing.zeroReason === 'no-text' || !writing.response.trim()) return { score: 0, raw: 0, message: 'Ausência de texto: nota zero, conforme o documento.' };
  const { nc, ne, tl } = writing;
  if (nc === null || nc === undefined || ne === null || ne === undefined || tl === null || tl === undefined) return { score: null, raw: null, message: 'Informe NC, NE e TL para calcular a estimativa.' };
  if (!Number.isFinite(nc) || nc < 0 || nc > part.maximum || !Number.isInteger(ne) || ne < 0 || !Number.isInteger(tl) || tl <= 0 || tl > part.maximumLines) return { score: null, raw: null, message: `Dados inválidos: NC entre 0 e ${part.maximum}, NE inteiro não negativo e TL entre 1 e ${part.maximumLines} linhas consideradas na folha.` };
  const raw = nc - part.languagePenalty * ne / tl;
  return { score: Math.max(0, raw), raw, message: raw < 0 ? 'O resultado da fórmula foi negativo e foi limitado a zero conforme o documento.' : 'Estimativa pedagógica com nota de conteúdo, erros e linhas informados manualmente.' };
}

function downloadWriting(writing: WritingRecord) {
  const result = calculateWritingScore(writing);
  const part = writing.scoringRules?.parts.find(part => part.id === writing.kind);
  const text = [writing.title, `Criado em: ${new Date(writing.createdAt).toLocaleString('pt-BR')}`, 'Proposta pessoal de treino; não é uma questão discursiva oficial.', '', 'PROPOSTA', writing.prompt, '', 'RESPOSTA', writing.response, '', 'REESCRITA', writing.rewrite, '', 'AUTOAVALIAÇÃO', ...writing.criteria.map(c => `${c.name}: ${c.score === null ? 'não avaliado' : c.score}/${c.maximum}\n${c.feedback}`), ...(part ? ['', 'ESTIMATIVA PELA FÓRMULA DO DOCUMENTO', `${writing.kind?.toUpperCase()}: NC=${writing.nc ?? 'não informado'}, NE=${writing.ne ?? 'não informado'}, TL=${writing.tl ?? 'não informado'}`, `N${writing.kind?.toUpperCase()} = max(0, NC - ${part.languagePenalty} × NE / TL)`, `Estimativa: ${result.score === null ? 'pendente' : result.score.toLocaleString('pt-BR')} / ${part.maximum}`, result.message, `Fonte: ${writing.scoringRules?.sourceName}; versão: ${writing.scoringRules?.version}; seção: ${part.section}`, 'NC e NE são estimativas de autoavaliação; a correção oficial é realizada pela banca.'] : []), '', `Tempo registrado: ${formatTime(writing.minutes)}`, 'A contagem de linhas na tela não equivale à folha oficial.'].join('\n');
  downloadFile(`discursiva-${writing.id.slice(0, 8)}.txt`, text, 'text/plain;charset=utf-8');
}

export default function Writing({ state, update, navigate }: ModuleProps) {
  const writings = state.writings.filter(w => w.isDemo === state.demoMode);
  const [selectedId, setSelectedId] = useState(writings[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [plannedMinutes, setPlannedMinutes] = useState(45);
  const [tab, setTab] = useState<'response' | 'rewrite'>('response');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const active = writings.find(w => w.id === selectedId) ?? writings[0];
  const currentRules = state.rules.writingConfig;
  const officialPart = active?.scoringRules?.parts.find(part => part.id === active.kind);
  const activeScore = active ? calculateWritingScore(active) : null;
  const pair = active?.pairId ? writings.filter(writing => writing.pairId === active.pairId) : [];
  const q1 = pair.find(writing => writing.kind === 'q1');
  const q2 = pair.find(writing => writing.kind === 'q2');
  const q1Score = q1 ? calculateWritingScore(q1).score : null;
  const q2Score = q2 ? calculateWritingScore(q2).score : null;
  const pairScore = q1Score !== null && q2Score !== null && q1?.scoringRules?.version === q2?.scoringRules?.version ? q1Score + q2Score : null;
  const elapsedMinutes = pair.length ? pair.reduce((sum, writing) => sum + writing.minutes, 0) : active?.minutes ?? 0;

  useEffect(() => { setRunning(false); setSavedAt(null); }, [active?.id]);
  useEffect(() => {
    if (!running || !active) return;
    let lastTick = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTick) / 60000;
      lastTick = now;
      update(prev => {
        const writing = prev.writings.find(w => w.id === active.id);
        if (!writing) return prev;
        const date = localDay(new Date(now));
        const logId = `writing:${writing.id}:${date}`;
        const existingLog = prev.studyLogs.find(log => log.id === logId);
        return { ...prev, writings: prev.writings.map(w => w.id === writing.id ? { ...w, minutes: w.minutes + delta } : w),
          studyLogs: existingLog ? prev.studyLogs.map(log => log.id === logId ? { ...log, minutes: log.minutes + delta } : log) : [...prev.studyLogs, { id: logId, date, minutes: delta, category: 'writing', isDemo: writing.isDemo }] };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, active?.id, update]);

  function newWriting(kind: WritingRecord['kind'] = 'personal', pairId?: string): WritingRecord {
    const part = currentRules?.parts.find(part => part.id === kind);
    return { id: crypto.randomUUID(), title: part ? `${part.id.toUpperCase()} · ${part.label} — treino pessoal` : 'Novo treino discursivo', prompt: '', response: '', rewrite: '', minutes: 0, createdAt: new Date().toISOString(), rubricVerified: false, isDemo: state.demoMode, kind, pairId,
      ...(part && currentRules ? { scoringRules: structuredClone(currentRules), nc: null, ne: null, tl: null, zeroReason: 'none' as const } : {}),
      criteria: [{ name: 'Precisão técnica e atendimento à proposta', maximum: 4, score: null, feedback: '' }, { name: 'Estrutura, argumentos e coerência', maximum: 4, score: null, feedback: '' }, { name: 'Clareza e correção da linguagem', maximum: 2, score: null, feedback: '' }] };
  }

  function create(kind: WritingRecord['kind'] = 'personal') {
    const writing = newWriting(kind);
    update(prev => ({ ...prev, writings: [...prev.writings, writing] })); setSelectedId(writing.id); setTab('response');
  }

  function createPair() {
    if (!currentRules?.verified) return;
    const pairId = crypto.randomUUID();
    const first = newWriting('q1', pairId);
    const second = newWriting('q2', pairId);
    update(prev => ({ ...prev, writings: [...prev.writings, first, second] }));
    setSelectedId(first.id); setTab('response'); setPlannedMinutes(currentRules.durationMinutes);
  }

  function edit(patch: Partial<WritingRecord>) {
    if (!active) return;
    update(prev => ({ ...prev, writings: prev.writings.map(w => w.id === active.id ? { ...w, ...patch } : w) }));
    setSavedAt(null);
  }

  function editCriterion(index: number, patch: Partial<WritingRecord['criteria'][number]>) {
    if (!active) return;
    edit({ criteria: active.criteria.map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion) });
  }

  const answer = active ? (tab === 'response' ? active.response : active.rewrite) : '';
  const wordCount = answer.trim() ? answer.trim().split(/\s+/u).length : 0;
  const scoredCriteria = active?.criteria.filter(c => c.score !== null) ?? [];
  const totalScore = scoredCriteria.reduce((sum, c) => sum + (c.score ?? 0), 0);
  const totalMaximum = active?.criteria.reduce((sum, c) => sum + c.maximum, 0) ?? 0;

  return <div>
    <div className="page-header"><div><p className="eyebrow">ESCREVER · REVISAR · REESCREVER</p><h1>Discursivas</h1><p className="muted">Construa uma resposta técnica clara e acompanhe sua evolução.</p></div><button className="button button-primary" onClick={() => create()}><Plus size={17} /> Novo treino livre</button></div>
    <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={18} /><strong>{currentRules?.verified ? 'Estrutura conferida no documento fornecido' : 'Estrutura oficial ainda não verificada'}</strong></div>
      <p className="muted">{state.rules.writingRules || 'A proposta, os critérios, a duração e os limites oficiais precisam ser confirmados no edital vigente. O editor pode ser usado desde já para treinos pessoais.'}</p>
      <p className="muted" style={{ marginBottom: 0 }}>Fonte configurada: {state.rules.sourceName || 'pendente'} · versão {state.rules.version}. <button className="button button-secondary" style={{ marginLeft: 8 }} onClick={() => navigate('syllabus')}>Consultar edital</button></p>
      {currentRules?.verified && <><p><strong>Tempo total da discursiva:</strong> {currentRules.durationMinutes} minutos, separado dos {state.rules.durationMinutes ?? 'não informados'} minutos das objetivas. A divisão de tempo entre os textos é pessoal.</p><p className="muted">Regras extraídas do PDF fornecido. A confirmação de vigência e retificações na página oficial permanece conforme o registro de fontes.</p><div className="toolbar" style={{ marginTop: 18 }}><button className="button button-primary" onClick={createPair}><Plus size={16} /> Treinar Q1 + Q2</button>{currentRules.parts.map(part => <button className="button button-secondary" key={part.id} onClick={() => create(part.id)}>Novo {part.id.toUpperCase()} · até {part.maximumLines} linhas</button>)}</div></>}
    </div>
    {!active ? <div className="card empty-state" style={{ padding: 48 }}><PenLine size={38} style={{ color: 'var(--accent, #7654cd)', marginBottom: 12 }} /><h2>Sua primeira resposta começa aqui</h2><p>Adicione uma proposta, escreva com o cronômetro e avalie o texto por critérios. Sua resposta e reescrita ficam salvas neste navegador.</p><button className="button button-primary" onClick={() => create()}><Plus size={16} /> Criar treino pessoal</button></div> : <>
      <div className="toolbar" style={{ marginBottom: 20, justifyContent: 'space-between', gap: 16 }}>
        <label className="field" style={{ minWidth: 230, flex: 1 }}>Treino salvo<select value={active.id} onChange={e => { setSelectedId(e.target.value); setTab('response'); }}>{writings.map(w => <option value={w.id} key={w.id}>{w.title} · {new Date(w.createdAt).toLocaleDateString('pt-BR')}</option>)}</select></label>
        <button className="button button-secondary" onClick={() => downloadWriting(active)}><Download size={16} /> Exportar texto</button>
        <button className="button button-primary" onClick={() => { edit({ ...active }); setSavedAt(new Date().toLocaleTimeString('pt-BR')); }}><Save size={16} /> Salvar agora</button>
      </div>
      {pair.length > 0 && <div className="toolbar" aria-label="Textos do treino conjunto" style={{ marginBottom: 20 }}>{pair.map(writing => <button key={writing.id} className={`button ${active.id === writing.id ? 'button-primary' : 'button-secondary'}`} aria-pressed={active.id === writing.id} onClick={() => { setSelectedId(writing.id); setTab('response'); }}>{writing.kind?.toUpperCase()} · {writing.kind === 'q1' ? 'Complementares' : 'Situação-problema'}</button>)}</div>}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 18 }}><h2 style={{ margin: 0 }}><FileText size={18} style={{ verticalAlign: 'middle' }} /> Proposta de treino</h2><span className="badge">{active.rubricVerified ? 'Critérios conferidos' : 'Treino pessoal'}</span></div>
            {officialPart && <p className="muted"><strong>{officialPart.label}:</strong> até {officialPart.maximumLines} linhas na folha e {officialPart.maximum} pontos · {officialPart.section}. O formato vem do documento; a proposta de treino é pessoal.</p>}
            <label className="field">Título<input value={active.title} onChange={e => edit({ title: e.target.value })} placeholder="Nome do treino" /></label>
            <label className="field" style={{ marginTop: 16 }}>Comando e temas a desenvolver<textarea aria-label="Comando e temas a desenvolver" value={active.prompt} onChange={e => edit({ prompt: e.target.value })} rows={5} placeholder="Cole a proposta e identifique sua fonte. Para uma proposta própria, informe que é um treino autoral." /></label>
            {!active.prompt && <button className="button button-secondary" style={{ marginTop: 12 }} onClick={() => edit(active.kind === 'q1' ? { title: 'Q1 · Governança, riscos e controle — treino autoral', prompt: 'Proposta autoral de treino, não extraída de prova oficial. Um órgão público identificou que a mesma pessoa aprova uma contratação e autoriza seu pagamento, sem revisão por outra unidade. Em texto dissertativo, diferencie direção, gestão e controle; identifique um risco do cenário, sua causa e consequência; explique um controle proporcional e o risco residual. Use apenas os fatos fornecidos, indicando quando houver uma hipótese adicional. Tema de treino vinculado a Fundamentos de Governança, Riscos e Integridade, seção 15.2.3 do PDF fornecido.' } : { title: `${active.kind === 'q2' ? 'Q2 · ' : ''}Segurança no desenvolvimento de aplicações — treino autoral`, prompt: 'Proposta autoral de treino, não extraída de prova oficial. Situação-problema: uma aplicação web permite consultar relatórios por um parâmetro de identificação. Um usuário autenticado modifica esse parâmetro e obtém um relatório ao qual não deveria ter acesso. Explique a diferença entre autenticação e autorização; identifique a falha de controle de acesso; proponha uma verificação no servidor e testes que demonstrem o bloqueio do acesso indevido. Não presuma tecnologias, versões ou outros mecanismos que o cenário não fornece. Organize a resposta com diagnóstico, solução e verificação, consultando referências técnicas verificáveis.' })}>Usar uma proposta autoral educativa</button>}
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div className="toolbar" role="tablist" aria-label="Versão do texto" style={{ marginBottom: 18 }}><button className={`button ${tab === 'response' ? 'button-primary' : 'button-secondary'}`} role="tab" aria-selected={tab === 'response'} onClick={() => setTab('response')}>Resposta inicial</button><button className={`button ${tab === 'rewrite' ? 'button-primary' : 'button-secondary'}`} role="tab" aria-selected={tab === 'rewrite'} onClick={() => setTab('rewrite')}>Reescrita</button></div>
            <label className="field">{tab === 'response' ? 'Sua resposta' : 'Sua reescrita após a revisão'}<textarea aria-label={tab === 'response' ? 'Sua resposta' : 'Sua reescrita após a revisão'} value={answer} onChange={e => edit(tab === 'response' ? { response: e.target.value } : { rewrite: e.target.value })} rows={17} placeholder={tab === 'response' ? 'Escreva sua resposta. O texto é salvo automaticamente.' : 'Reescreva preservando a primeira versão para comparar seu aprendizado.'} style={{ lineHeight: 1.85, resize: 'vertical' }} /></label>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12 }}><small className="muted">{wordCount} palavras · {answer.length} caracteres</small><small className="muted">{savedAt ? `Salvo às ${savedAt}` : 'Salvamento automático local'}</small></div>
            <p className="muted" style={{ fontSize: 12 }}>Linhas visuais variam com tela, fonte e zoom; não equivalem às linhas da folha oficial. Consulte o edital para os limites e critérios aplicáveis.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}><p className="eyebrow">TEMPO DE PRÁTICA {pair.length ? '· Q1 + Q2' : ''}</p><h2 style={{ fontSize: 38, margin: '10px 0' }}>{formatTime(elapsedMinutes)}</h2>{pair.length > 0 && <p className="muted">Q1: {formatTime(q1?.minutes ?? 0)} · Q2: {formatTime(q2?.minutes ?? 0)} · referência total do documento: {active.scoringRules?.durationMinutes} minutos. Não há uma divisão oficial de minutos por texto no trecho conferido.</p>}<label className="field">Meta pessoal de tempo (minutos)<input type="number" min={1} max={480} value={plannedMinutes} onChange={e => setPlannedMinutes(Math.max(1, Math.min(480, Number(e.target.value) || 1)))} /></label><p className="muted">{elapsedMinutes >= plannedMinutes ? 'A meta pessoal de tempo foi atingida. Você pode continuar para concluir e corrigir.' : `Faltam cerca de ${Math.max(0, Math.ceil(plannedMinutes - elapsedMinutes))} minutos para sua meta pessoal.`}</p><button className={`button ${running ? 'button-secondary' : 'button-primary'}`} onClick={() => setRunning(!running)}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? 'Pausar cronômetro' : 'Iniciar cronômetro'}</button><p className="muted" style={{ fontSize: 12 }}>Tempo acumulado salvo. Ao recarregar ou trocar de texto, o cronômetro fica pausado. Este registro com pausas serve para treino; não certifica execução dentro do tempo oficial.</p></div>
          {officialPart && active.scoringRules && activeScore && <div className="card" style={{ padding: 24 }}><p className="eyebrow">FÓRMULA DO DOCUMENTO · {active.kind?.toUpperCase()}</p><h2>Estimativa pedagógica manual</h2><p className="muted">A fórmula e os limites vêm do PDF. NC, NE e TL são informados por você; não são uma correção oficial ou uma avaliação por IA.</p>
            <label className="field">NC — nota de conteúdo (0 a {officialPart.maximum})<input type="number" min={0} max={officialPart.maximum} step={0.01} value={active.nc ?? ''} placeholder="Não avaliado" onChange={e => edit({ nc: e.target.value === '' ? null : Math.max(0, Math.min(officialPart.maximum, Number(e.target.value) || 0)) })} /></label>
            <p className="muted" style={{ fontSize: 12 }}>Apresentação, estrutura e desenvolvimento do tema. Na avaliação oficial, NC resulta de examinadores distintos, conforme 9.7.4.1.</p>
            <div className="grid-2" style={{ gap: 12 }}><label className="field">NE — erros de linguagem<input type="number" min={0} step={1} value={active.ne ?? ''} placeholder="Não contado" onChange={e => edit({ ne: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label><label className="field">TL — linhas na folha real<input type="number" min={1} max={officialPart.maximumLines} step={1} value={active.tl ?? ''} placeholder="Informe manualmente" onChange={e => edit({ tl: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label></div>
            <p className="muted" style={{ fontSize: 12 }}>NE considera grafia, morfossintaxe e propriedade vocabular. Informe TL de uma folha manuscrita ou modelo com linhas fixas, limitado ao texto considerado na avaliação. Fragmentos fora do espaço e além de {officialPart.maximumLines} linhas são desconsiderados. A tela não mede TL.</p>
            <label className="field">Condição do texto<select value={active.zeroReason ?? 'none'} onChange={e => edit({ zeroReason: e.target.value as WritingRecord['zeroReason'] })}><option value="none">Avaliação normal</option><option value="off-topic">Fuga ao tema — nota zero</option><option value="no-text">Sem texto — nota zero</option></select></label>
            <div style={{ background: 'var(--accent-soft, #f5f2ff)', padding: 18, borderRadius: 12, marginTop: 16 }}><p style={{ marginTop: 0 }}><strong>N{active.kind?.toUpperCase()} = max(0, NC − {officialPart.languagePenalty} × NE ÷ TL)</strong></p><strong style={{ fontSize: 28 }}>{activeScore.score === null ? 'Aguardando dados' : `${activeScore.score.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / ${officialPart.maximum}`}</strong><p className="muted">{activeScore.message}</p>{activeScore.raw !== null && activeScore.raw < 0 && <p className="muted">Valor antes do limite: {activeScore.raw.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}.</p>}</div>
            <p className="muted" style={{ fontSize: 12 }}>Regra salva com o treino: {active.scoringRules.version} · {officialPart.section} · consulta {active.scoringRules.consultedAt} · {active.scoringRules.sourceName}.</p>
            {pair.length > 0 && <div style={{ borderTop: '1px solid var(--border, #ebe8f0)', paddingTop: 16 }}><h3>NFPD = NQ1 + NQ2</h3><p>Q1: {q1Score === null ? 'pendente' : q1Score.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} · Q2: {q2Score === null ? 'pendente' : q2Score.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</p><p><strong>{pairScore === null ? 'Total pendente' : `Estimativa total: ${pairScore.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / ${active.scoringRules.parts.reduce((sum, part) => sum + part.maximum, 0)}`}</strong></p><p className="muted">{pairScore === null ? 'Complete os dados dos dois textos para comparar ao requisito do documento.' : pairScore >= active.scoringRules.minimum ? `A estimativa alcança o requisito numérico de ${active.scoringRules.minimum} pontos descrito em 9.7.8.` : `A estimativa permanece abaixo do requisito numérico de ${active.scoringRules.minimum} pontos descrito em 9.7.8.`} A nota real depende da correção oficial; isto não estabelece aprovação ou classificação. Ausência de texto e fuga ao tema recebem zero.</p></div>}
          </div>}
          <div className="card" style={{ padding: 24 }}><p className="eyebrow">CRITÉRIOS PESSOAIS DE APRIMORAMENTO</p><h2>Autoavaliação e feedback</h2><p className="muted">Rubrica pessoal inicial, sem equivalência com NC ou com a nota oficial. As notas são inseridas por você; não há correção por IA nesta versão. Use o feedback para melhorar a reescrita.</p>
            {active.criteria.map((criterion, index) => <div key={index} style={{ borderTop: '1px solid var(--border, #ebe8f0)', padding: '18px 0' }}>
              <label className="field">Critério<input value={criterion.name} onChange={e => editCriterion(index, { name: e.target.value })} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}><label className="field">Máximo pessoal<input type="number" min={0} step={0.5} value={criterion.maximum} onChange={e => { const maximum = Math.max(0, Number(e.target.value) || 0); editCriterion(index, { maximum, score: criterion.score === null ? null : Math.min(maximum, criterion.score) }); }} /></label><label className="field">Sua nota<input type="number" min={0} max={criterion.maximum} step={0.5} value={criterion.score ?? ''} onChange={e => editCriterion(index, { score: e.target.value === '' ? null : Math.min(criterion.maximum, Math.max(0, Number(e.target.value) || 0)) })} placeholder="Não avaliado" /></label></div>
              <label className="field" style={{ marginTop: 12 }}>Evidências e próxima melhoria<textarea aria-label={`Evidências e próxima melhoria: ${criterion.name}`} rows={3} value={criterion.feedback} onChange={e => editCriterion(index, { feedback: e.target.value })} placeholder="Cite um trecho e uma mudança concreta para a reescrita." /></label>
            </div>)}
            <div style={{ background: 'var(--accent-soft, #f5f2ff)', padding: 16, borderRadius: 12 }}><strong>{scoredCriteria.length ? `${totalScore.toLocaleString('pt-BR')} / ${totalMaximum.toLocaleString('pt-BR')}` : 'Aguardando autoavaliação'}</strong><p className="muted" style={{ marginBottom: 0 }}>{scoredCriteria.length} de {active.criteria.length} critérios avaliados{scoredCriteria.length < active.criteria.length ? ' · resultado parcial' : ' · nota pessoal, não oficial'}</p></div>
          </div>
        </div>
      </div>
    </>}
  </div>;
}
