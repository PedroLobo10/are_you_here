import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({actionTimeout:8_000});
test.setTimeout(60_000);

// Synthetic fixtures exist only in this browser test's isolated storage.
// They are never seeded into the application or represented as a real question base.
const fixtures = [
  {statement:'FIXTURE DE TESTE 1: um item julgado certo.',discipline:'TI — fixture de teste',topic:'Tema A',answer:'C'},
  {statement:'FIXTURE DE TESTE 2: um item julgado errado.',discipline:'TI — fixture de teste',topic:'Tema B',answer:'E'},
  {statement:'FIXTURE DE TESTE 3: um item destinado à omissão.',discipline:'TI — fixture de teste',topic:'Tema C',answer:'C'},
].map((q,i)=>({...q,board:'Cebraspe',organization:'Fixture sintética',role:'Teste automatizado',year:2025,block:'general',origin:'official',source:'Fixture sintética de teste, nunca base de estudo real',sourceUrl:'https://example.org/test-fixture-only.json',itemNumber:String(i+1),keyStatus:'final'}));

async function persisted(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('prumo.study.v1')||'{}'));}
async function nav(page:Page,label:string){const menu=page.getByRole('button',{name:'Abrir menu',exact:true});if(await menu.isVisible()&&!await page.locator('.sidebar-open').count())await menu.click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:label,exact:true}).click();}
async function importFixtures(page:Page){
  const block=await page.evaluate(async()=>{const modulePath='/src/storage.ts';return (await import(modulePath)).loadState().state.rules.blocks[0].id;});
  await nav(page,'Questões');await page.getByRole('button',{name:'Importar questões',exact:true}).click();
  await page.locator('.upload-zone input').setInputFiles({name:'fixture-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixtures.map(q=>({...q,block}))))});
  await expect(page.getByRole('heading',{name:'Prévia: 3 item(ns) válido(s)'})).toBeVisible();
  await page.getByRole('checkbox',{name:/Conferi os enunciados/}).check();
  await page.getByRole('button',{name:'Importar 3 item(ns) no banco real'}).click();
  await page.getByRole('button',{name:'Fechar importação'}).click();
  await page.getByLabel('Pesquisar no banco').fill('FIXTURE DE TESTE');
  await expect(page.locator('.question-card')).toHaveCount(3);
}
async function answer(page:Page,index:number,confidenceIndex=4){
  await page.locator('.answer-options button').nth(index).click();
  await page.locator('.confidence-option').nth(confidenceIndex).click();
  await page.getByRole('button',{name:/Responder e corrigir/}).click();
  await expect(page.locator('.runner-feedback')).toBeVisible();
}

test('import → resolution → reload → metrics → review → changed key → filtering and export',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:5173');
  await expect(page.getByRole('heading',{name:/Pedro/})).toBeVisible();
  await page.screenshot({path:'/tmp/prumo-desktop.png',fullPage:true});
  const empty=await persisted(page);expect(empty.sessions??[]).toHaveLength(0);
  await importFixtures(page);await page.getByRole('button',{name:'Resolver 3 questões',exact:true}).click();
  await page.getByRole('button',{name:/Responder e corrigir/}).click();await expect(page.getByText('Escolha Certo, Errado ou Deixar em branco antes de registrar.')).toBeVisible();
  await page.locator('.answer-options button').nth(0).click();await page.getByRole('button',{name:/Responder e corrigir/}).click();await expect(page.getByText('Registre seu grau de confiança antes de responder.')).toBeVisible();
  // A changed answer is preserved inside the same attempt.
  await page.locator('.answer-options button').nth(1).click();await answer(page,0);
  await page.getByLabel('Correção ativa e anotação pessoal').fill('Minha anotação persistente.');
  await page.reload();await nav(page,'Hoje');await page.getByRole('button',{name:'Retomar minha sessão'}).click();
  await expect(page.getByLabel('Correção ativa e anotação pessoal')).toHaveValue('Minha anotação persistente.');
  await page.getByRole('button',{name:'Próxima questão'}).click();await answer(page,0);
  await page.getByRole('button',{name:'Próxima questão'}).click();await answer(page,2,2);
  await page.getByRole('button',{name:'Concluir e corrigir sessão'}).click();
  await expect(page.getByRole('heading',{name:'Sua sessão, em perspectiva'})).toBeVisible();
  await expect(page.locator('.runner-score-grid')).toContainText('1 acertos · 1 erros · 1 brancos');
  let s=await persisted(page);expect(s.sessions[0].attempts).toHaveLength(3);expect(s.sessions[0].attempts[0].changes).toHaveLength(3);expect(s.sessions[0].attempts[0].initial).toBe('C');expect(s.sessions[0].attempts[0].answer).toBe('C');expect(s.sessions[0].status).toBe('completed');expect(s.reviews).toHaveLength(1);
  await page.getByRole('button',{name:'Voltar ao plano'}).click();await nav(page,'Revisões');
  await page.locator('.reviews-tabs').getByRole('button',{name:/Agendadas/}).click();await page.getByRole('button',{name:/Começar revisão/}).click();
  await answer(page,1);await page.getByRole('button',{name:'Concluir e corrigir sessão'}).click();
  s=await persisted(page);expect(s.reviews.some((r:any)=>!!r.completedAt)).toBe(true);expect(s.sessions).toHaveLength(2);
  await page.getByRole('button',{name:'Voltar ao plano'}).click();await nav(page,'Questões');
  await page.getByLabel('Pesquisar no banco').fill('FIXTURE DE TESTE');
  await page.locator('.question-card').nth(1).getByRole('button',{name:'Fonte e histórico'}).click();
  await page.getByRole('button',{name:'Registrar retificação de gabarito'}).click();await page.locator('.key-editor').getByLabel('Resposta').selectOption('C');await page.locator('.key-editor').getByLabel('Situação').selectOption('changed');await page.getByLabel('Fonte / URL verificável da retificação').fill('https://example.org/changed-test-fixture-only');await page.getByRole('button',{name:'Salvar nova versão'}).click();
  s=await persisted(page);expect(s.questions.find((q:any)=>q.sourceUrl==='https://example.org/test-fixture-only.json'&&q.itemNumber==='2').keyVersion).toBe(2);expect(s.sessions[0].attempts[1].keyVersionAtAnswer).toBe(1);expect(s.sessions[0].attempts[1].answer).toBe('C');
  await page.locator('.filter-row select').nth(2).selectOption('wrong');await expect(page.locator('.question-card')).toHaveCount(1); // review answer E became wrong after key C.
  await page.getByRole('button',{name:'Limpar filtros'}).click();await page.getByLabel('Pesquisar no banco').fill('FIXTURE DE TESTE');await expect(page.locator('.question-card')).toHaveCount(3);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar resultado JSON'}).click();expect((await download).suggestedFilename()).toBe('questoes-reais.json');
  await nav(page,'Estatísticas');await expect(page.locator('body')).toContainText('Precisão');
  expect(errors).toEqual([]);
});

test('mobile layout, demo isolation and keyboard navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:5173');await expect(page.getByRole('heading',{name:/Pedro/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'/tmp/prumo-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Explorar demonstração'}).click();await page.getByRole('button',{name:'Começar meu estudo de hoje'}).click();
  await expect(page.locator('.session-runner')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('.confidence-option').nth(2).click();await page.locator('h1').click();await page.keyboard.press('e');await page.keyboard.press('Enter');
  // Diagnostic withholds correction until completion.
  await expect(page.locator('.runner-feedback')).toHaveCount(0);const s=await persisted(page);expect(s.sessions[0].isDemo).toBe(true);expect(s.sessions[0].attempts[0].answer).toBe('E');expect(s.sessions[0].attempts[0].submitted).toBe(true);
});

test('simulation timeout preserves draft, never invents unseen blanks',async({page})=>{
  await page.goto('http://localhost:5173');await importFixtures(page);
  await page.evaluate(async()=>{
    const s=JSON.parse(localStorage.getItem('prumo.study.v1')!);
    const corePath='/src/core.ts';const core=await import(corePath);
    s.rules.durationMinutes=0.05;
    s.sessions.push(core.createSession(s,'simulation',s.questions.filter((q:any)=>q.sourceUrl==='https://example.org/test-fixture-only.json').map((q:any)=>q.id)));
    localStorage.setItem('prumo.study.v1',JSON.stringify(s));
  });
  await page.reload();await nav(page,'Hoje');await page.getByRole('button',{name:'Retomar minha sessão'}).click();
  await page.locator('.answer-options button').nth(0).click();
  await expect(page.getByRole('heading',{name:'Sua sessão, em perspectiva'})).toBeVisible({timeout:10_000});
  const s=await persisted(page);expect(s.sessions[0].status).toBe('completed');expect(s.sessions[0].endedByTimeout).toBe(true);expect(s.sessions[0].attempts[0].answer).toBe('C');expect(s.sessions[0].attempts[0].submitted).toBe(true);expect(s.sessions[0].attempts[0].confidenceRecorded).toBe(false);expect(s.sessions[0].attempts.slice(1).every((a:any)=>!a.submitted&&!a.presentedAt)).toBe(true);
  await expect(page.getByText(/2 itens não apresentados. Esta é uma amostra parcial/)).toBeVisible();
});

test('provided edital PDF survives reload, complete backup, deletion and restore',async({page})=>{
  test.setTimeout(120_000);
  await page.goto('http://localhost:5173');await nav(page,'Edital verticalizado');
  await page.locator('.syllabus-page input[type=file][accept="application/pdf,.pdf"]').setInputFiles('public/documents/edital-cgu-affc-2026.pdf');
  await expect.poll(async()=>{const s=await persisted(page);return s.sources?.filter((source:any)=>source.documentId&&source.status==='uploaded').length||0;},{timeout:60_000}).toBeGreaterThan(0);
  let s=await persisted(page);const uploaded=s.sources.find((source:any)=>source.documentId&&source.status==='uploaded');expect(uploaded.extractedText.length).toBeGreaterThan(100);
  const docId=uploaded.documentId;
  await page.reload();await page.getByRole('tab',{name:'Fontes e documentos'}).click();
  await expect(page.locator('.original-document summary').filter({hasText:'PDF original'}).last()).toBeVisible();
  await nav(page,'Configurações');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar backup completo'}).click();const download=await downloadPromise;const backupBytes=await readFile((await download.path())!);const backup=JSON.parse(backupBytes.toString());expect(backup.documents.some((doc:any)=>doc.id===docId&&doc.base64.length>100)).toBe(true);
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');await page.getByRole('button',{name:'Excluir dados',exact:true}).click();
  await expect(page.getByText('Dados de estudo e PDFs excluídos deste navegador. Preferências mantidas.')).toBeVisible();
  s=await persisted(page);expect(s.sources.some((source:any)=>source.documentId===docId)).toBe(false);
  await page.locator('.settings-page input[type=file][accept=".json"]').setInputFiles({name:'restaurar-backup.json',mimeType:'application/json',buffer:backupBytes});
  await page.getByRole('button',{name:'Restaurar estes dados'}).click();await expect(page.getByText('Backup restaurado. Histórico, regras e sessões ativas estão disponíveis.')).toBeVisible();
  await nav(page,'Edital verticalizado');await page.getByRole('tab',{name:'Fontes e documentos'}).click();
  const source=page.locator('.source-row').filter({hasText:uploaded.title}).last();await source.locator('.original-document summary').click();await expect(source.locator('iframe')).toHaveAttribute('src',/^blob:/);
  const doc=await page.evaluate(async(id)=>{const path='/src/documents.ts';const stored=await(await import(path)).getDocument(id);return stored?{id:stored.id,size:stored.blob.size}:null;},docId);expect(doc?.id).toBe(docId);expect(doc?.size).toBeGreaterThan(1000);
});

test('CSV quoting and imported commentary preserve provenance without AI validation',async({page})=>{
  await page.goto('http://localhost:5173');
  const result=await page.evaluate(async()=>{
    const modulePath='/src/components/Questions.tsx';const importer=await import(modulePath);
    const rows=importer.parseQuestionCSV('statement,board,discipline,topic,source,sourceUrl,answer\r\n"Linha 1, com vírgula\nLinha 2 ""aspas""",Cebraspe,TI,SQL,Fixture,https://example.org/test-fixture-only,C');
    const ai=importer.validateImportedQuestion({...rows[0],explanation:{direct:'Comentário de fixture produzido por IA.',steps:['Passo de teste.'],author:'ai',validated:true,reference:'https://example.org/test-reference-only'}});
    const otherBoard=importer.validateImportedQuestion({...rows[0],board:'Outra banca'});
    const authoral=importer.validateImportedQuestion({...rows[0],origin:'demo'});
    let malformed=false;try{importer.parseQuestionCSV('a,b\n"sem fim,b')}catch{malformed=true;}
    return {rows:rows.length,statement:rows[0].statement,ai:ai.question?.explanation,answer:ai.question?.answer,otherBoardBlocked:!!otherBoard.error,authoralBlocked:!!authoral.error,malformed};
  });
  expect(result.rows).toBe(1);expect(result.statement).toBe('Linha 1, com vírgula\nLinha 2 "aspas"');expect(result.ai.author).toBe('ai');expect(result.ai.validated).toBe(false);expect(result.ai.steps).toEqual(['Passo de teste.']);expect(result.answer).toBe('C');expect(result.otherBoardBlocked).toBe(true);expect(result.authoralBlocked).toBe(true);expect(result.malformed).toBe(true);
});

test('bundled official bank survives an older installation without fabricated study results',async({page})=>{
  await page.goto('http://localhost:5173');
  await expect(page.getByRole('heading',{name:/Pedro/})).toBeVisible();
  const initial=await page.evaluate(async()=>{const path='/src/storage.ts';return(await import(path)).loadState().state;});
  expect(initial.questions.filter((q:any)=>!q.isDemo)).toHaveLength(315);
  expect(initial.sessions).toHaveLength(0);
  // Simulate an earlier installation containing one real item with a favorite.
  await page.evaluate((s)=>{
    const kept=s.questions.find((q:any)=>!q.isDemo);kept.favorite=true;
    s.profile.name='Pedro Lobo';s.questions=s.questions.filter((q:any)=>q.isDemo||q.id===kept.id);
    s.sources=s.sources.filter((source:any)=>!source.questionBankDocumentKind);
    localStorage.setItem('prumo.study.v1',JSON.stringify(s));
  },initial);
  await page.reload();await nav(page,'Questões');
  await expect(page.getByText('315 questões no banco real.',{exact:true})).toBeVisible();
  const migrated=await persisted(page);
  expect(migrated.questions.filter((q:any)=>!q.isDemo)).toHaveLength(315);
  expect(migrated.questions.find((q:any)=>!q.isDemo).favorite).toBe(true);
  expect(migrated.sessions).toHaveLength(0);expect(migrated.reviews).toHaveLength(0);
  await page.getByRole('button',{name:'Consultar fontes do pacote oficial'}).click();
  await expect(page.getByText('94 de 205 tópicos',{exact:true})).toBeVisible();
  await expect(page.getByText('13 de 13 disciplinas',{exact:true})).toBeVisible();
  await expect(page.getByText(/As 315 questões deste pacote já estão presentes/)).toBeVisible();
  await page.getByText('Conferir provas, fontes e gabaritos',{exact:true}).click();
  expect(await page.getByRole('link',{name:'Abrir cópia PDF conferida',exact:true}).count()).toBe(15);
  const pdf=await page.request.get(await page.getByRole('link',{name:'Abrir cópia PDF conferida',exact:true}).first().getAttribute('href')||'');
  expect(pdf.ok()).toBe(true);expect((await pdf.body()).subarray(0,5).toString()).toBe('%PDF-');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar pacote JSON'}).click();
  const downloaded=JSON.parse((await readFile((await(await downloadPromise).path())!)).toString());
  expect(downloaded.questions).toHaveLength(315);expect(downloaded.questions.every((q:any)=>q.origin==='official'&&!q.isDemo)).toBe(true);
});

test('official Java item preserves code and assertion on mobile, scores and schedules review',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:5173');await nav(page,'Questões');
  await page.getByLabel('Pesquisar no banco').fill('int resultado = fun(3)');
  await expect(page.locator('.question-card')).toHaveCount(1);
  const text=await page.locator('.question-card .question-statement-body').innerText();
  expect(text.indexOf('public class Main')).toBeLessThan(text.indexOf('Ao ser executado'));
  expect(text.trim().endsWith('6')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('.question-card').getByRole('button',{name:'Resolver',exact:true}).click();
  await expect(page.locator('.runner-question-card pre')).toHaveCount(2);
  await expect(page.locator('.runner-feedback')).toHaveCount(0);
  await answer(page,0);await expect(page.locator('.runner-feedback')).toContainText('Errado');
  await page.getByRole('button',{name:'Concluir e corrigir sessão'}).click();
  const s=await persisted(page);expect(s.sessions).toHaveLength(1);expect(s.sessions[0].questionIds).toEqual(['cebraspe-bcb-2024-002-094']);
  expect(s.reviews.some((r:any)=>r.questionId==='cebraspe-bcb-2024-002-094')).toBe(true);
  const stats=await page.evaluate(async()=>{const modulePath='/src/core.ts';return(await import(modulePath)).calculateStats(JSON.parse(localStorage.getItem('prumo.study.v1')!));});
  expect(stats.attempts).toBe(1);expect(stats.unique).toBe(1);expect(stats.wrong).toBe(1);expect(stats.net).toBe(-2);expect(stats.netRate).toBe(-1);
  await page.reload();const reloaded=await persisted(page);expect(reloaded.sessions[0].attempts).toHaveLength(1);expect(reloaded.questions.filter((q:any)=>!q.isDemo)).toHaveLength(315);
  expect(errors).toEqual([]);
});

test('official battery exposes only the linked PDF page and withholds bank keys until completion',async({page})=>{
  await page.goto('http://localhost:5173');await nav(page,'Questões');await page.getByLabel('Pesquisar no banco').fill('int resultado = fun(3)');
  await page.locator('.study-toolbar select').selectOption('battery');
  await page.locator('.question-card').getByRole('button',{name:'Resolver',exact:true}).click();
  const original=page.locator('.session-runner .original-document');await original.locator('summary').click();
  await expect(original.locator('img')).toBeVisible({timeout:20000});
  expect(await original.locator('a,iframe').count()).toBe(0);
  await nav(page,'Questões');await expect(page.getByRole('button',{name:'Consultar fontes do pacote oficial'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Exportar resultado JSON'})).toBeDisabled();
  await nav(page,'Edital verticalizado');await page.getByRole('tab',{name:'Fontes e documentos'}).click();
  expect(await page.locator('.source-row').filter({hasText:'Gabarito definitivo'}).count()).toBe(0);
  await nav(page,'Hoje');await page.getByRole('button',{name:'Retomar minha sessão'}).click();
  await page.locator('.answer-options button').nth(1).click();await page.locator('.confidence-option').nth(3).click();
  await page.getByRole('button',{name:/Salvar resposta/}).click();
  await page.getByRole('button',{name:'Concluir e corrigir sessão'}).click();
  await expect(page.getByRole('heading',{name:'Sua sessão, em perspectiva'})).toBeVisible();
  await page.getByRole('button',{name:'Voltar ao plano'}).click();await nav(page,'Questões');
  await expect(page.getByRole('button',{name:'Consultar fontes do pacote oficial'})).toBeEnabled();
});

test('recent catalog preserves visual evidence, source limits and mobile study persistence',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:5173');await nav(page,'Questões');
  await expect(page.locator('.question-card').first().locator('.question-meta')).toContainText('2026');
  await page.getByLabel('Pesquisar no banco').fill('SELECT a+10 FROM TABELA');
  await expect(page.locator('.question-card')).toHaveCount(1);
  await expect(page.locator('.question-card .question-meta')).toContainText('2025');
  await expect(page.locator('.question-card .question-evidence')).toContainText('PDF definitivo ainda não conferido');
  await page.locator('.question-card').getByRole('button',{name:'Resolver',exact:true}).click();
  await expect(page.locator('.session-runner pre')).toContainText('INSERT INTO TABELA VALUES (null)');
  await page.locator('.original-question-pages summary').click();
  const original=page.locator('.original-question-pages img').first();await expect(original).toBeVisible();
  await expect.poll(()=>original.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(1000);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await answer(page,0);await expect(page.locator('.runner-feedback')).toContainText('Errado');
  await expect(page.getByRole('link',{name:'Transcrição pública identificada',exact:true})).toHaveAttribute('href',/github.com\/aureovinicius\/concursos-cgu\/blob\/a14f358/);
  await page.getByRole('button',{name:'Concluir e corrigir sessão'}).click();
  const before=await persisted(page);expect(before.sessions[0].attempts).toHaveLength(1);expect(before.reviews).toHaveLength(1);
  const solved=before.questions.find((q:any)=>q.id===before.sessions[0].questionIds[0]);expect(solved.keyVerification).toBe('public-transcription');expect(solved.originalPages).toHaveLength(4);
  await page.reload();const after=await persisted(page);expect(after.sessions).toEqual(before.sessions);expect(after.reviews).toEqual(before.reviews);
  expect(errors).toEqual([]);
});

test('expanded bank can start 170 distinct items with official block counts and no fabricated answers',async({page})=>{
  await page.goto('http://localhost:5173');await nav(page,'Simulados');
  await page.getByLabel(/^Formato/).selectOption('official');
  await page.getByRole('button',{name:'Iniciar simulado na estrutura oficial',exact:true}).click();
  await expect(page.locator('.session-runner')).toBeVisible();
  const state=await persisted(page);const session=state.sessions[0];
  expect(session.questionIds).toHaveLength(170);expect(new Set(session.questionIds).size).toBe(170);expect(session.durationMinutes).toBe(300);
  for(const [id,count]of [['p1',40],['p2',40],['p3',90]]as const)expect(session.questionIds.filter((qid:string)=>state.questions.find((q:any)=>q.id===qid)?.block===id)).toHaveLength(count);
  expect(session.attempts.filter((attempt:any)=>attempt.submitted)).toHaveLength(0);
  await expect(page.locator('.runner-feedback')).toHaveCount(0);
  const stats=await page.evaluate(async()=>{const path='/src/core.ts';return(await import(path)).calculateStats(JSON.parse(localStorage.getItem('prumo.study.v1')!));});
  expect(stats.attempts).toBe(0);expect(stats.precision).toBeNull();expect(stats.netRate).toBeNull();
});
