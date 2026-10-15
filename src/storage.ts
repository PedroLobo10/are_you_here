import { useState, useCallback, useEffect } from 'react';
import type { AppState } from './types';
import { initialRules, initialTopics, initialQuestions, sourceRecords, officialQuestionBank } from './source-data';
import { mergeQuestionBank } from './question-bank';

export const STORAGE_KEY = 'prumo.study.v1';
export function freshState(): AppState {
  return {schemaVersion:1, profile:{name:'Pedro Lobo',dailyMinutes:240,daysPerWeek:6,selfReportedNet:40,reviewIntervals:[1,7,15,30],targetNet:70,theme:'light',reducedDay:false},questions:structuredClone(initialQuestions),topics:structuredClone(initialTopics),sessions:[],reviews:[],studyLogs:[],writings:[],rules:structuredClone(initialRules),sources:structuredClone(sourceRecords),demoMode:false};
}
const array = (value:unknown) => Array.isArray(value);
const object = (value:unknown) => value!==null && typeof value==='object' && !Array.isArray(value);
const text = (value:unknown) => typeof value==='string';
const optionalText = (value:unknown) => value===undefined||text(value);
const date = (value:unknown) => text(value)&&Number.isFinite(Date.parse(value as string));
const answer = (value:unknown) => value===null||value==='C'||value==='E';
const keyStatuses = ['preliminary','final','changed','annulled'];
const modes = ['learning','battery','simulation','review','interpretation','diagnostic'];
const errorTypes = ['Falta de conhecimento','Confusão entre conceitos','Leitura incompleta','Negação ou exceção ignorada','Generalização indevida','Desatenção','Pressa','Erro de execução ou cálculo','Conteúdo desatualizado','Chute','Excesso de confiança'];
const url = (value:unknown,allowEmpty=false) => {if(allowEmpty&&value==='')return true;if(!text(value))return false;try{return ['https:','http:'].includes(new URL(value as string).protocol);}catch{return false;}};
function validWritingRules(r:NonNullable<AppState['rules']['writingConfig']>) {
  return object(r)&&text(r.version)&&text(r.sourceName)&&url(r.sourceUrl,!r.verified)&&text(r.consultedAt)&&typeof r.verified==='boolean'&&Number.isFinite(r.durationMinutes)&&r.durationMinutes>0&&Number.isFinite(r.minimum)&&array(r.parts)&&r.parts.every(p=>object(p)&&['q1','q2'].includes(p.id)&&text(p.label)&&Number.isFinite(p.maximum)&&p.maximum>0&&Number.isInteger(p.maximumLines)&&p.maximumLines>0&&Number.isFinite(p.languagePenalty)&&p.languagePenalty>=0&&text(p.section));
}
function validRules(r:AppState['rules']) {
  return object(r)&&text(r.version)&&text(r.specialty)&&text(r.sourceName)&&url(r.sourceUrl,!r.verified)&&typeof r.verified==='boolean'
    &&text(r.consultedAt)&&text(r.notes)&&text(r.writingRules)&&array(r.dates)&&r.dates.every(d=>object(d)&&text(d.label)&&text(d.date)&&typeof d.verified==='boolean')
    &&(r.totalMinimum===null||Number.isFinite(r.totalMinimum))&&(r.durationMinutes===null||Number.isFinite(r.durationMinutes)&&r.durationMinutes>0)
    &&array(r.blocks)&&r.blocks.length>0&&new Set(r.blocks.map(b=>b?.id)).size===r.blocks.length
    &&(r.writingConfig===undefined||validWritingRules(r.writingConfig))
    &&r.blocks.every(b=>object(b)&&text(b.id)&&b.id.length>0&&text(b.name)&&(b.items===null||Number.isInteger(b.items)&&b.items>0)&&Number.isFinite(b.gain)&&b.gain>=0&&Number.isFinite(b.penalty)&&b.penalty>=0&&Number.isFinite(b.omission)&&(b.minimum===null||Number.isFinite(b.minimum))&&['exclude','award'].includes(b.annulled));
}
export function validateBackup(value:unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const s = value as AppState;
  return s.schemaVersion === 1 && object(s.profile) && typeof s.profile.name === 'string'
    && Number.isFinite(s.profile.dailyMinutes) && s.profile.dailyMinutes > 0
    && Number.isInteger(s.profile.daysPerWeek) && s.profile.daysPerWeek >= 1 && s.profile.daysPerWeek <= 7
    && array(s.profile.reviewIntervals) && s.profile.reviewIntervals.every(n=>Number.isFinite(n)&&n>0)
    && Number.isFinite(s.profile.selfReportedNet)&&Number.isFinite(s.profile.targetNet)&&typeof s.profile.reducedDay==='boolean'
    && ['light','dark'].includes(s.profile.theme) && typeof s.demoMode === 'boolean'
    && array(s.questions) && new Set(s.questions.map(q=>q?.id)).size===s.questions.length && s.questions.every(q=>object(q)&&text(q.id)&&text(q.statement)&&answer(q.answer)&&typeof q.isDemo==='boolean'&&['official','demo'].includes(q.origin)&&q.isDemo===(q.origin==='demo')&&text(q.board)&&text(q.organization)&&text(q.role)&&text(q.discipline)&&text(q.topic)&&text(q.block)&&text(q.source)&&(q.sourceUrl===undefined||url(q.sourceUrl))&&(q.year===null||Number.isInteger(q.year))&&typeof q.favorite==='boolean'&&date(q.importedAt)&&keyStatuses.includes(q.keyStatus)&&Number.isInteger(q.keyVersion)&&q.keyVersion>0&&array(q.keyHistory)&&q.keyHistory.every(k=>object(k)&&Number.isInteger(k.version)&&k.version>0&&answer(k.answer)&&keyStatuses.includes(k.status)&&date(k.date)&&text(k.source))&&(q.explanation===undefined||object(q.explanation)&&text(q.explanation.direct)&&array(q.explanation.steps)&&q.explanation.steps.every(text)&&['source','human','ai','demo'].includes(q.explanation.author)&&typeof q.explanation.validated==='boolean'))
    && array(s.topics) && s.topics.every(t=>object(t)&&text(t.id)&&text(t.name)&&text(t.discipline)&&text(t.block)&&Number.isFinite(t.difficulty)&&['not-started','studying','reviewing','consolidated'].includes(t.status)&&typeof t.verified==='boolean')
    && array(s.sessions) && new Set(s.sessions.map(x=>x?.id)).size===s.sessions.length && s.sessions.every(x=>object(x)&&text(x.id)&&array(x.questionIds)&&x.questionIds.every(text)&&array(x.attempts)&&validRules(x.rules)&&modes.includes(x.mode)&&['active','completed','abandoned'].includes(x.status)&&typeof x.isDemo==='boolean'&&date(x.startedAt)&&(x.completedAt===undefined||date(x.completedAt))&&Number.isInteger(x.currentIndex)&&x.currentIndex>=0&&(x.durationMinutes===null||Number.isFinite(x.durationMinutes)&&x.durationMinutes>0)&&x.attempts.every(a=>object(a)&&text(a.id)&&text(a.questionId)&&answer(a.initial)&&answer(a.answer)&&array(a.changes)&&a.changes.every(c=>object(c)&&answer(c.answer)&&date(c.at))&&Number.isFinite(a.elapsedMs)&&a.elapsedMs>=0&&Number.isFinite(a.confidence)&&a.confidence>=0&&a.confidence<=100&&typeof a.submitted==='boolean'&&(a.presentedAt===''||date(a.presentedAt))&&(a.submittedAt===undefined||date(a.submittedAt))&&text(a.note)&&typeof a.marked==='boolean'&&Number.isInteger(a.keyVersionAtAnswer)))
    && array(s.reviews) && s.reviews.every(r=>object(r)&&text(r.id)&&text(r.questionId)&&text(r.sessionId)&&date(r.dueAt)&&Number.isInteger(r.stage)&&r.stage>=0&&['error','uncertain','marked'].includes(r.reason)&&errorTypes.includes(r.errorType)&&text(r.concept)&&text(r.note)&&typeof r.isDemo==='boolean'&&(r.completedAt===undefined||date(r.completedAt)))
    && array(s.studyLogs) && s.studyLogs.every(l=>object(l)&&text(l.id)&&text(l.date)&&text(l.category)&&typeof l.isDemo==='boolean'&&Number.isFinite(l.minutes)&&l.minutes>=0)
    && array(s.writings) && s.writings.every(w=>object(w)&&text(w.id)&&text(w.title)&&text(w.prompt)&&text(w.response)&&text(w.rewrite)&&date(w.createdAt)&&Number.isFinite(w.minutes)&&w.minutes>=0&&typeof w.rubricVerified==='boolean'&&typeof w.isDemo==='boolean'&&array(w.criteria)&&w.criteria.every(c=>object(c)&&text(c.name)&&Number.isFinite(c.maximum)&&c.maximum>=0&&(c.score===null||Number.isFinite(c.score)&&c.score>=0&&c.score<=c.maximum)&&text(c.feedback)))
    && validRules(s.rules)
    && array(s.sources)&&s.sources.every(r=>object(r)&&text(r.id)&&text(r.title)&&url(r.url,true)&&text(r.consultedAt)&&['verified','unavailable','uploaded'].includes(r.status)&&text(r.detail)&&optionalText(r.extractedText)&&optionalText(r.fileName)&&optionalText(r.documentId)&&(r.assetUrl===undefined||/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(r.assetUrl)))
    &&s.questions.every(q=>optionalText(q.code)&&optionalText(q.language)&&optionalText(q.pdfDocumentId)&&(q.pdfAssetUrl===undefined||/^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(q.pdfAssetUrl))&&(q.pdfPage===undefined||Number.isInteger(q.pdfPage)&&q.pdfPage>0)&&optionalText(q.subtopic)&&optionalText(q.topicId)&&optionalText(q.examId)&&optionalText(q.itemNumber)&&optionalText(q.difficulty)&&optionalText(q.difficultyCriterion)&&(!q.explanation||['decisive','concept','whyWrong','rewrite','trap','summary','reference','divergence'].every(k=>optionalText(q.explanation![k as keyof typeof q.explanation]))))
    &&s.sessions.every(s=>s.attempts.every(a=>(a.confidenceRecorded===undefined||typeof a.confidenceRecorded==='boolean')&&(a.diagnosticAnswer===undefined||answer(a.diagnosticAnswer))&&(a.errorType===undefined||errorTypes.includes(a.errorType))))
    &&s.writings.every(w=>(w.kind===undefined||['personal','q1','q2'].includes(w.kind))&&(w.nc===undefined||w.nc===null||Number.isFinite(w.nc))&&(w.ne===undefined||w.ne===null||Number.isFinite(w.ne))&&(w.tl===undefined||w.tl===null||Number.isFinite(w.tl))&&(w.zeroReason===undefined||['none','off-topic','no-text'].includes(w.zeroReason))&&optionalText(w.pairId)&&(w.scoringRules===undefined||validWritingRules(w.scoringRules)));
}
export function loadState(): {state:AppState;error:string|null} {
  try {
    const saved=localStorage.getItem(STORAGE_KEY);
    if (!saved) return {state:freshState(),error:null};
    const parsed:unknown=JSON.parse(saved);
    if (!validateBackup(parsed)) return {state:freshState(),error:'Os dados salvos não passaram na verificação. O arquivo original foi preservado. Exporte-o em Configurações antes de restaurar um backup.'};
    const sources=[...parsed.sources,...sourceRecords.filter(seed=>!parsed.sources.some(s=>s.id===seed.id))];
    const upgrade=parsed.rules.version==='provisorio-v1'&&initialRules.verified&&parsed.topics.length===0&&!parsed.questions.some(q=>!q.isDemo);
    const base=upgrade?{...parsed,rules:structuredClone(initialRules),topics:structuredClone(initialTopics),sources}:{...parsed,sources};
    return {state:mergeQuestionBank(base,officialQuestionBank).state,error:null};
  } catch { return {state:freshState(),error:'Não foi possível ler o armazenamento deste navegador. Seus dados não foram sobrescritos. Você pode exportar e restaurar um backup em Configurações.'}; }
}
export function usePersistentState() {
  const [initial]=useState(loadState);
  const [state,setState]=useState<AppState>(initial.state);
  const [error,setError]=useState<string|null>(initial.error);
  const [protectedStorage,setProtectedStorage]=useState(!!initial.error);
  // Persist the initial package/migration once; never overwrite a recovery snapshot.
  useEffect(()=>{
    if(initial.error)return;
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(initial.state)); }
    catch { setError('O navegador não conseguiu salvar os dados. O estado atual continua aberto; exporte um backup antes de fechar a página.'); }
  },[initial]);
  const update=useCallback((updater:(prev:AppState)=>AppState)=> {
    setState(prev=>{
      const next=updater(prev);
      if (!protectedStorage) {
        try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setError(null); }
        catch { setError('O navegador não conseguiu salvar os dados. O estado atual continua aberto; exporte um backup antes de fechar a página.'); }
      }
      return next;
    });
  },[protectedStorage]);
  const restore=useCallback((next:AppState)=>{
    if(!validateBackup(next)) throw new Error('Backup inválido ou incompatível.');
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setState(next);setProtectedStorage(false);setError(null);
  },[]);
  return {state,update,error,restore};
}
export function downloadFile(name:string,content:string,mime='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
