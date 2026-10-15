import { useMemo, useState } from 'react';
import { Clock, Play, Target, AlertTriangle, FileCheck2, ArrowRight, Check, Minus } from 'lucide-react';
import { computeSessionStats } from '../core';
import type { Answer, ModuleProps, Question, Session } from '../types';

const percentage = (value: number | null) => value === null ? 'Sem dados' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const points = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const answerName = (answer: Answer) => answer === 'C' ? 'Certo' : answer === 'E' ? 'Errado' : 'Em branco';

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const random = Math.floor(Math.random() * (index + 1));
    [result[index], result[random]] = [result[random], result[index]];
  }
  return result;
}

/** Each available discipline receives an item before any receives a second. */
export function broadSelection(questions: Question[], count: number): string[] {
  const limit = Math.min(Math.floor(Math.max(0, count)), questions.length);
  const groups = new Map<string, Question[]>();
  shuffled(questions).forEach(q => groups.set(q.discipline, [...(groups.get(q.discipline) ?? []), q]));
  const selected: string[] = [];
  const representedBlocks = new Set<string>();
  while (selected.length < limit && [...groups.values()].some(group => group.length)) {
    for (const group of groups.values()) {
      // Prefer a new block within each discipline while preserving discipline coverage.
      const candidate = group.findIndex(q => !representedBlocks.has(q.block));
      const [q] = group.splice(candidate >= 0 ? candidate : 0, 1);
      if (q) { selected.push(q.id); representedBlocks.add(q.block); }
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

export default function Simulations({ state, update, navigate, startSession }: ModuleProps) {
  const [discipline, setDiscipline] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [count, setCount] = useState(30);
  const [duration, setDuration] = useState(state.rules.durationMinutes ?? 45);
  const [format, setFormat] = useState<'personal' | 'official'>('personal');
  const [selectedReport, setSelectedReport] = useState('');
  const [diagnosticOpen, setDiagnosticOpen] = useState<string[]>([]);

  const available = useMemo(() => state.questions.filter(q => q.isDemo === state.demoMode && q.keyStatus !== 'annulled' && q.answer !== null && (state.demoMode || (q.origin === 'official' && /^(cebraspe|cespe)(\s*\/.*)?$/i.test(q.board.trim())))), [state.questions, state.demoMode]);
  const seen = useMemo(() => new Set(state.sessions.filter(s => s.isDemo === state.demoMode).flatMap(s => s.attempts.filter(a => a.presentedAt || a.submitted).map(a => a.questionId))), [state.sessions, state.demoMode]);
  const pool = available.filter(q => (!discipline || q.discipline === discipline) && (!blockFilter || q.block === blockFilter) && (!onlyNew || !seen.has(q.id)));
  const unseen = available.filter(q => !seen.has(q.id));
  const diagnosticCount = Math.min(count, unseen.length);
  const diagnosticDisciplines = new Set(unseen.map(q => q.discipline)).size;
  const availableDisciplines = new Set(available.map(q => q.discipline)).size;
  const completed = state.sessions.filter(s => s.isDemo === state.demoMode && s.status === 'completed' && (s.mode === 'simulation' || s.mode === 'diagnostic')).sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
  const report = completed.find(s => s.id === selectedReport) ?? completed[0];
  const stats = report ? computeSessionStats(state, report) : null;
  const officialStructure = !state.demoMode && state.rules.verified && state.rules.durationMinutes !== null && Number.isFinite(state.rules.durationMinutes) && state.rules.durationMinutes > 0 && state.rules.blocks.length > 0 && state.rules.blocks.every(b => b.items !== null && Number.isInteger(b.items) && b.items >= 0) && state.rules.blocks.some(b => (b.items ?? 0) > 0);
  const officialItems = state.rules.blocks.reduce((sum, b) => sum + (b.items ?? 0), 0);
  const canOfficial = officialStructure && state.rules.blocks.every(b => available.filter(q => q.block === b.id).length >= (b.items ?? 0));
  const endedWithinTime = (session: Session) => {
    const start = Date.parse(session.startedAt);
    const end = Date.parse(session.completedAt ?? '');
    const duration = session.durationMinutes;
    return duration !== null && Number.isFinite(duration) && duration > 0 && Number.isFinite(start) && Number.isFinite(end) && end >= start && end <= start + duration * 60000;
  };
  const reportHasOfficialStructure = (session: Session) => {
    if (session.mode !== 'simulation' || session.status !== 'completed' || session.isDemo || !session.rules.verified || session.durationMinutes !== session.rules.durationMinutes || !endedWithinTime(session) || !session.questionIds.length || new Set(session.questionIds).size !== session.questionIds.length) return false;
    const allSubmitted = session.questionIds.every(id => {
      const question = state.questions.find(q => q.id === id);
      const attempt = session.attempts.find(a => a.questionId === id && a.submitted && a.presentedAt);
      return question && !question.isDemo && question.origin === 'official' && attempt;
    });
    return allSubmitted && session.rules.blocks.length > 0
      && session.rules.blocks.every(b => b.items !== null && Number.isInteger(b.items) && b.items >= 0 && session.questionIds.filter(id => state.questions.find(q => q.id === id)?.block === b.id).length === b.items)
      && session.questionIds.length === session.rules.blocks.reduce((n, b) => n + (b.items ?? 0), 0);
  };

  function beginSimulation() {
    const ids = format === 'official'
      ? state.rules.blocks.flatMap(b => shuffled(available.filter(q => q.block === b.id)).slice(0, b.items ?? 0).map(q => q.id))
      : broadSelection(pool, Math.min(count, pool.length));
    if (!ids.length || (format === 'official' && !canOfficial)) return;
    const options = { durationMinutes: format === 'official' ? state.rules.durationMinutes : duration, officialStructure: format === 'official' };
    startSession('simulation', ids, options);
  }

  function recordDiagnostic(sessionId: string, questionId: string, answer: Answer) {
    update(prev => ({ ...prev, sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, attempts: s.attempts.map(a => a.questionId === questionId ? { ...a, diagnosticAnswer: answer } : a) } : s) }));
  }

  const submitted = report?.attempts.filter(a => a.submitted) ?? [];
  const highConfidenceErrors = submitted.filter(a => { const q = state.questions.find(q => q.id === a.questionId); return q && q.answer !== null && q.keyStatus !== 'annulled' && a.answer !== null && a.answer !== q.answer && a.confidenceRecorded !== false && a.confidence >= 80; });
  const lowConfidenceCorrect = submitted.filter(a => { const q = state.questions.find(q => q.id === a.questionId); return q && q.answer !== null && q.keyStatus !== 'annulled' && a.answer === q.answer && a.confidenceRecorded !== false && a.confidence <= 50; });
  const omitted = submitted.filter(a => a.answer === null);

  return <div>
    <div className="page-header"><div><p className="eyebrow">TREINAR A PROVA · MEDIR O QUE IMPORTA</p><h1>Simulados e diagnóstico</h1><p className="muted">Tempo controlado, correção ao finalizar e análise das suas decisões.</p></div><span className="badge">{state.demoMode ? 'Dados demonstrativos' : 'Histórico real'}</span></div>
    {state.rules.verified && <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}><strong>Regra de referência: {state.rules.sourceName}</strong><p className="muted">Objetivas: {state.rules.durationMinutes} minutos{state.rules.writingConfig ? ` · discursiva: ${state.rules.writingConfig.durationMinutes} minutos em treino separado` : ''}. Versão: {state.rules.version} · consulta: {state.rules.consultedAt}.</p><p className="muted" style={{ marginBottom: 0 }}>A confirmação de vigência, autenticidade e retificações online permanece conforme o registro de fontes. <button className="text-button" onClick={() => navigate('syllabus')}>Consultar fontes e situação do edital</button></p></div>}
    {!state.rules.verified && <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><AlertTriangle size={19} /><strong>Treinos disponíveis. Simulado oficial aguarda o edital.</strong></div><p className="muted" style={{ marginBottom: 0 }}>A estrutura, o tempo, os pesos e os mínimos do edital vigente ainda não foram verificados. Treinos pessoais usam a regra provisória {state.rules.version}; seus resultados não demonstram cumprimento dos critérios eliminatórios.</p></div>}
    <div className="grid-2" style={{ alignItems: 'start', marginBottom: 28 }}>
      <div className="card" style={{ padding: 26 }}><p className="eyebrow">CONFIGURE SEU TREINO</p><h2>Uma prova, sem interrupções</h2><p className="muted">O gabarito fica oculto até o encerramento. Alterações de resposta pertencem à mesma tentativa.</p>
        <label className="field">Formato<select value={format} onChange={e => setFormat(e.target.value as 'personal' | 'official')}><option value="personal">Treino personalizado — estrutura pessoal</option><option value="official" disabled={!canOfficial}>Estrutura oficial verificada{!canOfficial ? ' — indisponível' : ''}</option></select></label>
        {format === 'personal' ? <>
          <div className="grid-2" style={{ gap: 14, marginTop: 16 }}><label className="field">Quantidade de itens<input type="number" min={1} max={1000} value={count} onChange={e => setCount(Math.floor(Math.max(1, Math.min(1000, Number(e.target.value) || 1))))} /></label><label className="field">Tempo pessoal (minutos)<input type="number" min={1} max={600} value={duration} onChange={e => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} /></label></div>
          <div className="grid-2" style={{ gap: 14, marginTop: 16 }}><label className="field">Disciplina<select value={discipline} onChange={e => setDiscipline(e.target.value)}><option value="">Todas as disponíveis</option>{[...new Set(available.map(q => q.discipline))].sort().map(d => <option value={d} key={d}>{d}</option>)}</select></label><label className="field">Bloco<select value={blockFilter} onChange={e => setBlockFilter(e.target.value)}><option value="">Todos os disponíveis</option>{[...new Set(available.map(q => q.block))].map(id => <option value={id} key={id}>{state.rules.blocks.find(b => b.id === id)?.name ?? id}</option>)}</select></label></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18 }}><input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} /> Somente questões nunca apresentadas</label>
          <p className="muted">{pool.length} itens elegíveis. Serão selecionados {Math.min(count, pool.length)} itens, distribuídos entre os grupos disponíveis. Essa distribuição não representa incidência histórica.</p>
        </> : <p>{officialItems} itens · {state.rules.durationMinutes} minutos · distribuição por blocos conforme a regra {state.rules.version}.</p>}
        <button className="button button-primary" disabled={format === 'official' ? !canOfficial : !pool.length} onClick={beginSimulation}><Play size={17} /> {format === 'official' ? 'Iniciar simulado na estrutura oficial' : 'Iniciar treino cronometrado'}</button>
        {!available.length && <p className="muted">Importe questões oficiais Cebraspe com gabarito para começar ou ative a demonstração nas configurações.</p>}
        {!canOfficial && state.rules.verified && <p className="muted">Para um simulado completo, informe a duração e as quantidades verificadas e importe itens suficientes para cada bloco.</p>}
      </div>
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="card" style={{ padding: 26, background: 'var(--accent-soft, #f5f2ff)' }}><Target size={24} style={{ color: 'var(--accent, #7654cd)' }} /><p className="eyebrow" style={{ marginTop: 16 }}>SUA LINHA DE BASE</p><h2>Comece pelo diagnóstico</h2><p>Seu desempenho líquido autodeclarado de {state.profile.selfReportedNet.toLocaleString('pt-BR')}% é uma hipótese inicial. <strong>Não equivale à taxa de acertos.</strong></p><p className="muted">A seleção usa apenas itens nunca apresentados, abrangendo os grupos existentes no banco. A abrangência depende dos itens importados e não garante cobertura de todo o edital.</p>
          <p><strong>{unseen.length}</strong> itens inéditos disponíveis · {diagnosticCount} no diagnóstico · {Math.min(diagnosticCount, diagnosticDisciplines)} disciplinas na seleção.</p><p className="muted">{diagnosticDisciplines} de {availableDisciplines} disciplinas existentes no banco têm itens inéditos elegíveis. Cada disciplina recebe um item antes de receber outro.</p><button className="button button-primary" disabled={!unseen.length} onClick={() => startSession('diagnostic', broadSelection(unseen, diagnosticCount))}><Target size={16} /> Fazer diagnóstico inicial</button>
          {diagnosticCount > 0 && diagnosticCount < 20 && <p className="muted">Amostra pequena ({diagnosticCount} itens). Os resultados servirão como sinal inicial, sem conclusão estável de domínio.</p>}
          {diagnosticCount > 0 && diagnosticCount < diagnosticDisciplines && <p className="muted">Essa quantidade não abrange todas as disciplinas com itens inéditos. Aumente a quantidade para pelo menos {diagnosticDisciplines} ou complete a linha de base em outro diagnóstico.</p>}
        </div>
        <div className="card" style={{ padding: 24 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileCheck2 size={20} /><h2>Três referências diferentes</h2></div><p><strong>Mínimos eliminatórios:</strong> condições do edital, quando verificadas e aplicáveis à estrutura completa.</p><p><strong>Meta pessoal:</strong> seu alvo de aproveitamento líquido de {state.profile.targetNet.toLocaleString('pt-BR')}%, ajustável nas configurações.</p><p className="muted"><strong>Resultado histórico:</strong> exige uma fonte identificada e comparação compatível. Sem essa fonte, não exibimos classificação nem nota de corte.</p><button className="button button-secondary" onClick={() => navigate('syllabus')}>Ver regras e fontes <ArrowRight size={14} /></button></div>
      </div>
    </div>
    <div className="card" style={{ padding: 26 }}><div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 20 }}><div><p className="eyebrow">RELATÓRIO PÓS-SESSÃO</p><h2 style={{ marginBottom: 0 }}>A nota e as decisões por trás dela</h2></div>{completed.length > 0 && <label className="field">Sessão concluída<select value={report?.id ?? ''} onChange={e => { setSelectedReport(e.target.value); setDiagnosticOpen([]); }}>{completed.map(s => <option key={s.id} value={s.id}>{s.mode === 'diagnostic' ? 'Diagnóstico' : 'Simulado'} · {new Date(s.completedAt ?? s.startedAt).toLocaleString('pt-BR')} · {s.questionIds.length} itens</option>)}</select></label>}</div>
      {!report || !stats ? <div className="empty-state" style={{ padding: 35 }}><Clock size={30} /><h3>Seu primeiro relatório aparecerá aqui</h3><p>Conclua um diagnóstico ou treino cronometrado. Nenhuma nota demonstrativa entra no histórico real.</p></div> : <>
        <p className="muted">Regra de pontuação congelada: {report.rules.version} · gabaritos atuais · {stats.attempts} tentativas / {stats.unique} questões únicas · {stats.unpresented} itens não submetidos, separados de brancos.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 14, marginBottom: 24 }}>{[
          { label: 'Pontuação líquida', value: `${points(stats.net)} / ${points(stats.maxPoints)}` }, { label: 'Aproveitamento líquido', value: percentage(stats.netRate) }, { label: 'Precisão C/E', value: percentage(stats.precision) }, { label: 'Acertos · erros · brancos', value: `${stats.correct} · ${stats.wrong} · ${stats.blank}` },
        ].map(metric => <div key={metric.label} style={{ border: '1px solid var(--border, #ebe8f0)', borderRadius: 14, padding: 18 }}><small className="muted">{metric.label}</small><p style={{ fontSize: 23, fontWeight: 700, margin: '10px 0 0' }}>{metric.value}</p></div>)}</div>
        {(stats.missingRule > 0 || stats.excludedUnknownKey > 0) && <p><AlertTriangle size={16} style={{ verticalAlign: 'middle' }} /> Nota parcial: {stats.missingRule} itens sem regra e {stats.excludedUnknownKey} sem gabarito utilizável. Não conclua cumprimento de mínimos.</p>}
        <div className="grid-2" style={{ gap: 20 }}>
          <div><h3>Critérios e metas</h3><p><strong>Meta pessoal de aproveitamento:</strong> {stats.netRate === null ? 'sem resultado comparável' : stats.netRate * 100 >= state.profile.targetNet ? 'atingida' : 'ainda não atingida'} ({state.profile.targetNet}%).</p>
            {reportHasOfficialStructure(report) && stats.unpresented === 0 && !stats.missingRule && !stats.excludedUnknownKey ? <>
              {report.rules.blocks.map(block => {
                const blockStats = computeSessionStats(state, { ...report, questionIds: report.questionIds.filter(id => state.questions.find(q => q.id === id)?.block === block.id), attempts: report.attempts.filter(a => state.questions.find(q => q.id === a.questionId)?.block === block.id) });
                return <p key={block.id}><strong>{block.name}:</strong> {points(blockStats.net)} pontos {block.minimum === null ? '· mínimo não informado' : `· mínimo ${points(block.minimum)} ${blockStats.net >= block.minimum ? 'atingido' : 'não atingido'}`}</p>;
              })}
              <p><strong>Mínimo total:</strong> {report.rules.totalMinimum === null ? 'não informado' : `${points(report.rules.totalMinimum)} pontos · ${stats.net >= report.rules.totalMinimum ? 'atingido' : 'não atingido'}`}</p>
              <p className="muted">Atingir os mínimos evita esses critérios de eliminação; não estabelece aprovação, classificação ou nota de corte.</p>
            </> : <p className="muted">Os mínimos oficiais não são comparáveis a este resultado: é necessário edital verificado, estrutura completa, todos os itens apresentados e submetidos, pontuação integral calculável e encerramento dentro do tempo oficial.</p>}
            {report.mode === 'simulation' && report.durationMinutes !== null && !endedWithinTime(report) && <p className="muted"><AlertTriangle size={15} style={{ verticalAlign: 'middle' }} /> Encerramento fora do prazo ou duração sem verificação: resultado de treino, sem comparação aos mínimos da prova.</p>}
            {report.mode === 'diagnostic' && <><p className="muted">Esta linha de base é medida pelo aproveitamento líquido ({percentage(stats.netRate)}), separado da precisão ({percentage(stats.precision)}). A sessão contém {new Set(report.questionIds.map(id => state.questions.find(q => q.id === id)?.discipline).filter(Boolean)).size} disciplinas. Considere o tamanho e a cobertura da amostra.</p>{stats.valid < 20 && <p className="muted">Amostra insuficiente para uma conclusão estável: somente {stats.valid} respostas C/E válidas. Continue o diagnóstico com questões inéditas de outras lacunas.</p>}</>}
          </div>
          <div><h3>O que merece correção ativa</h3><p><strong>{highConfidenceErrors.length}</strong> erros com confiança ≥ 80%.</p><p><strong>{lowConfidenceCorrect.length}</strong> acertos com confiança ≤ 50%.</p><p><strong>{stats.initialChangesHelped}</strong> mudanças ajudaram · <strong>{stats.initialChangesHurt}</strong> prejudicaram, comparando resposta inicial e final pelo gabarito atual.</p><p><strong>{Math.round(stats.noGainMs / 60000)} min</strong> em itens pontuáveis sem ganho positivo.</p><button className="button button-secondary" disabled={!highConfidenceErrors.length && !lowConfidenceCorrect.length} onClick={() => startSession('review', [...new Set([...highConfidenceErrors, ...lowConfidenceCorrect].map(a => a.questionId))])}>Revisar essas decisões <ArrowRight size={14} /></button></div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 24 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><caption style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 12 }}>Confiança registrada antes da resposta · {stats.confidenceBands.reduce((sum, band) => sum + band.attempts, 0)} respostas C/E válidas com confiança registrada</caption><thead><tr><th style={{ textAlign: 'left', padding: '12px 0' }}>Faixa</th><th>Amostra</th><th>Acerto observado</th></tr></thead><tbody>{stats.confidenceBands.map(band => <tr key={band.label} style={{ borderTop: '1px solid var(--border, #ebe8f0)' }}><td style={{ padding: 12 }}>{band.label}</td><td style={{ textAlign: 'center' }}>{band.attempts}</td><td style={{ textAlign: 'center' }}>{percentage(band.accuracy)}</td></tr>)}</tbody></table></div>
        <p className="muted">Use a comparação para identificar excesso de confiança e incerteza. Com poucos itens, a taxa observada pode variar muito.</p>
        {omitted.length > 0 && <div style={{ borderTop: '1px solid var(--border, #ebe8f0)', marginTop: 24, paddingTop: 20 }}><h3>Diagnóstico dos itens omitidos</h3><p className="muted">Responda depois da prova para investigar o conceito. A resposta de diagnóstico não muda a resposta original, a nota, as tentativas ou as revisões agendadas.</p>
          {omitted.map(attempt => { const q = state.questions.find(q => q.id === attempt.questionId); if (!q) return null; const answered = attempt.diagnosticAnswer === 'C' || attempt.diagnosticAnswer === 'E'; const visible = diagnosticOpen.includes(attempt.id); return <div key={attempt.id} style={{ border: '1px solid var(--border, #ebe8f0)', borderRadius: 12, padding: 18, marginBottom: 12 }}><div className="toolbar" style={{ justifyContent: 'space-between' }}><strong>{q.discipline} · item {q.itemNumber ?? q.id.slice(0, 8)}</strong><span className="badge"><Minus size={12} /> Nota original: omissão</span></div><p>{q.statement}</p>{q.code && <pre style={{ overflowX: 'auto' }}><code>{q.code}</code></pre>}<div className="toolbar"><button className="button button-secondary" onClick={() => recordDiagnostic(report.id, q.id, 'C')} aria-pressed={attempt.diagnosticAnswer === 'C'}>Diagnóstico: Certo {attempt.diagnosticAnswer === 'C' && <Check size={13} />}</button><button className="button button-secondary" onClick={() => recordDiagnostic(report.id, q.id, 'E')} aria-pressed={attempt.diagnosticAnswer === 'E'}>Diagnóstico: Errado {attempt.diagnosticAnswer === 'E' && <Check size={13} />}</button>{answered && !visible && <button className="button button-primary" onClick={() => setDiagnosticOpen([...diagnosticOpen, attempt.id])}>Conferir diagnóstico</button>}</div>{answered && visible && <p><strong>Gabarito atual: {answerName(q.answer)}.</strong> Seu diagnóstico: {answerName(attempt.diagnosticAnswer ?? null)}. {q.keyStatus === 'annulled' ? 'Item anulado; não classifique este diagnóstico como acerto ou erro.' : q.answer === null ? 'Gabarito não disponível; diagnóstico sem classificação.' : attempt.diagnosticAnswer === q.answer ? 'Resposta de diagnóstico correta.' : 'Revise o conceito antes do próximo treino.'}</p>}</div>; })}
        </div>}
      </>}
    </div>
  </div>;
}
