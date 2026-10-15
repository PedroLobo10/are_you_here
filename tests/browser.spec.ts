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
async function nav(page:Page,label:string){await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:label,exact:true}).click();}
async function importFixtures(page:Page){
  const block=await page.evaluate(async()=>{const modulePath='/src/storage.ts';return (await import(modulePath)).loadState().state.rules.blocks[0].id;});
  await nav(page,'Questões');await page.getByRole('button',{name:'Importar questões',exact:true}).click();
  await page.locator('.upload-zone input').setInputFiles({name:'fixture-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixtures.map(q=>({...q,block}))))});
  await expect(page.getByRole('heading',{name:'Prévia: 3 item(ns) válido(s)'})).toBeVisible();
  await page.getByRole('checkbox',{name:/Conferi os enunciados/}).check();
  await page.getByRole('button',{name:'Importar 3 item(ns) no banco real'}).click();
  await expect(page.locator('.question-card')).toHaveCount(3);
  await page.getByRole('button',{name:'Fechar importação'}).click();
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
  await page.locator('.question-card').nth(1).getByRole('button',{name:'Fonte e histórico'}).click();
  await page.getByRole('button',{name:'Registrar retificação de gabarito'}).click();await page.locator('.key-editor').getByLabel('Resposta').selectOption('C');await page.locator('.key-editor').getByLabel('Situação').selectOption('changed');await page.getByLabel('Fonte / URL verificável da retificação').fill('https://example.org/changed-test-fixture-only');await page.getByRole('button',{name:'Salvar nova versão'}).click();
  s=await persisted(page);expect(s.questions.find((q:any)=>!q.isDemo&&q.itemNumber==='2').keyVersion).toBe(2);expect(s.sessions[0].attempts[1].keyVersionAtAnswer).toBe(1);expect(s.sessions[0].attempts[1].answer).toBe('C');
  await page.locator('.filter-row select').nth(2).selectOption('wrong');await expect(page.locator('.question-card')).toHaveCount(1); // review answer E became wrong after key C.
  await page.getByRole('button',{name:'Limpar filtros'}).click();await expect(page.locator('.question-card')).toHaveCount(3);
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
    s.sessions.push(core.createSession(s,'simulation',s.questions.filter((q:any)=>!q.isDemo).map((q:any)=>q.id)));
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
