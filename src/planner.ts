import type { AppState, Mode, Page } from './types';
import { calculateStats, getPriority } from './core';
export interface PlanTask {id:string;title:string;minutes:number;detail:string;why:string;page:Page;mode?:Mode;questionIds?:string[];done:boolean;}
export function localDay(date = new Date()) {return date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
export function getTodayPlan(state:AppState):PlanTask[] {
  const today=localDay();
  const mode=state.demoMode;
  const qs=state.questions.filter(q=>q.isDemo===mode && q.keyStatus!=='annulled' && q.answer!==null);
  const answered=new Set(state.sessions.filter(s=>s.isDemo===mode).flatMap(s=>s.attempts.filter(a=>a.presentedAt).map(a=>a.questionId)));
  const diagnostic=calculateStats(state,{isDemo:mode,mode:'diagnostic'}).valid>0;
  const priorities=state.topics.map(t=>({topic:t,priority:getPriority(state,t,mode)})).sort((a,b)=>b.priority.score-a.priority.score);
  const top=priorities[0];
  const eligible=new Set(qs.map(q=>q.id));
  const pending=state.reviews.filter(r=>r.isDemo===mode&&!r.completedAt&&new Date(r.dueAt)<=new Date()&&eligible.has(r.questionId));
  const uniqueDue=[...new Set(pending.map(r=>r.questionId))];
  const novel=qs.filter(q=>!answered.has(q.id));
  let selected:string[]=[];
  if(!diagnostic){
    const groups=new Map<string,typeof qs>();
    for(const q of novel.length?novel:qs){const group=groups.get(q.discipline)||[];group.push(q);groups.set(q.discipline,group);}
    const queues=[...groups.values()];
    while(selected.length<20&&queues.some(g=>g.length)){for(const g of queues){const q=g.shift();if(q&&selected.length<20)selected.push(q.id);}}
  }else{
    const ordered=novel.length?novel:qs;
    const focus=ordered.filter(q=>q.topicId===top?.topic.id);
    const contact=ordered.filter(q=>q.topicId!==top?.topic.id);
    selected=[...focus.slice(0,15),...contact.slice(0,5),...focus.slice(15),...contact.slice(5)].slice(0,20).map(q=>q.id);
  }
  const total=state.profile.reducedDay?Math.min(60,state.profile.dailyMinutes):state.profile.dailyMinutes;
  const base=state.profile.reducedDay?[20,15,10,10,5]:[75,60,45,30,30];
  const minutes=base.map((n,i)=>i===4?total-base.slice(0,4).reduce((a,b)=>a+Math.round(b*total/base.reduce((c,d)=>c+d,0)),0):Math.round(n*total/base.reduce((a,b)=>a+b,0)));
  const logged=(id:string)=>state.studyLogs.some(l=>l.date===today&&l.category===id&&l.isDemo===mode);
  const sessionsToday=state.sessions.filter(s=>s.isDemo===mode&&s.status==='completed'&&localDay(new Date(s.completedAt||s.startedAt))===today);
  const weekday=new Date().toLocaleDateString('en-US',{weekday:'short',timeZone:'America/Sao_Paulo'});
  const weekIndex=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(weekday);
  if(weekIndex>=state.profile.daysPerWeek&&!state.profile.reducedDay)return [{id:'rest',title:'Pausa planejada',minutes:0,detail:'Hoje está fora dos dias de estudo configurados.',why:'O orçamento semanal inclui dias de descanso. Se precisar recuperar uma tarefa, ative a rotina reduzida sem tratar estudo adicional como obrigação.',page:'reviews',done:false}];
  if(diagnostic&&!state.profile.reducedDay&&weekIndex===state.profile.daysPerWeek-1){
    const simulationMinutes=Math.round(total/2),correctionMinutes=Math.round(total/4),reviewMinutes=Math.round(total/8);
    return [
      {id:'questions',title:'Treino de simulado semanal',minutes:simulationMinutes,detail:'Uma bateria cronometrada seguida de correção ativa.',why:`Este é um treino parcial de ${simulationMinutes}min. A objetiva integral do documento exige ${state.rules.durationMinutes??'duração a conferir'}min; uma sessão parcial não permite certificar mínimos oficiais.`,page:'simulations',mode:'simulation',questionIds:qs.slice(0,40).map(q=>q.id),done:sessionsToday.some(s=>s.mode==='simulation')},
      {id:'correction',title:'Correção do simulado',minutes:correctionMinutes,detail:'Analise perdas, confiança e alterações de resposta.',why:'Priorize erros com alta confiança e registre o conceito que explica cada decisão.',page:'errors',done:logged('correction')},
      {id:'review',title:'Revisão espaçada',minutes:reviewMinutes,detail:`${uniqueDue.length} questões elegíveis para revisão.`,why:'Revisões vencidas continuam prioritárias; acertos inseguros também entram no caderno.',page:'reviews',mode:'review',questionIds:uniqueDue,done:sessionsToday.some(s=>s.mode==='review')},
      {id:'writing',title:'Prática discursiva',minutes:total-simulationMinutes-correctionMinutes-reviewMinutes,detail:'Pratique um trecho e revise estrutura e conteúdo.',why:'Treino parcial; o tempo total da discursiva é separado do da objetiva.',page:'writing',done:logged('writing')}
    ];
  }
  const tasks:PlanTask[]=[
    {id:'questions',title:!diagnostic?'Diagnóstico inicial':'Questões com propósito',minutes:minutes[0],detail:!diagnostic?(novel.length?'Questões inéditas para conhecer sua linha de base.':'Itens já vistos: treino exploratório. Importe inéditas para uma nova linha de base.'):top?top.topic.name:'Selecione uma bateria de questões inéditas.',why:!diagnostic?'Os 40% autodeclarados são pontuação líquida. O diagnóstico medirá precisão, omissões e pontuação separadamente. Se os itens já foram vistos, o resultado é um diagnóstico com repetição, não uma amostra inédita.':top?top.priority.reasons.join(' • '):'Ainda há poucos dados. Comece com questões inéditas de diferentes tópicos documentados.',page:'questions',mode:!diagnostic?'diagnostic':'learning',questionIds:selected,done:sessionsToday.some(s=>s.mode!=='review')},
    {id:'correction',title:'Correção ativa',minutes:minutes[1],detail:'Explique cada erro e registre o conceito correto.',why:'Acertos inseguros também precisam de correção. Classificar o motivo evita repetir o erro.',page:'errors',done:logged('correction')},
    {id:'theory',title:'Teoria direcionada',minutes:minutes[2],detail:top?top.topic.name:'Leia a referência de uma lacuna identificada.',why:'A teoria deve responder às dúvidas levantadas nas questões, com fonte verificável.',page:'syllabus',done:logged('theory')},
    {id:'review',title:'Revisão espaçada',minutes:minutes[3],detail:pending.length?`${uniqueDue.length} questões aguardam revisão.`:'Retome erros e acertos com baixa confiança.',why:'Intervalos iniciais configuráveis; a próxima revisão depende do seu desempenho.',page:'reviews',mode:'review',questionIds:uniqueDue,done:sessionsToday.some(s=>s.mode==='review')},
    {id:'writing',title:'Prática discursiva',minutes:minutes[4],detail:'Estruture uma resposta e reescreva um trecho.',why:'Treino pessoal até que os critérios e a estrutura oficiais sejam verificados.',page:'writing',done:logged('writing')}
  ];
  return tasks;
}
export function studyMinutesToday(state:AppState) {
  const today=localDay();
  const manual=state.studyLogs.filter(l=>l.isDemo===state.demoMode&&l.date===today).reduce((n,l)=>n+l.minutes,0);
  const attempts=state.sessions.filter(s=>s.isDemo===state.demoMode).flatMap(s=>s.attempts).filter(a=>a.presentedAt&&localDay(new Date(a.presentedAt))===today);
  return manual+attempts.reduce((n,a)=>n+a.elapsedMs/60000,0);
}
