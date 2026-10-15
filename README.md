# Prumo — preparação CGU

Plataforma de estudo por questões para Pedro Lobo, com foco em Tecnologia da Informação — Desenvolvimento de Sistemas e Cebraspe. React, TypeScript e Vite; dados reais e demonstração separados. Não há autenticação, servidor de dados, sincronização ou integração de IA nesta versão.

## Executar

Requer Node.js 20.19+ ou 22.12+ e npm. O ambiente preparado usa Node 24.

```bash
cd /workspace/are_you_here
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --port 5173 --strictPort
```

Cada tarefa de nuvem já possui checkout isolado. Use este checkout existente; não crie worktree sem solicitação explícita. Processos precisam ser reiniciados em novas máquinas; dependências e arquivos podem ser restaurados do snapshot.

```bash
npm run build
npm run preview -- --port 5173 --strictPort
npm test
npm run test:e2e
```

O teste de navegador usa Chromium em `/usr/bin/chromium`; `CHROMIUM_PATH` pode apontar para outra instalação. Testes têm armazenamento isolado e fixtures sintéticas que não são adicionadas ao banco da aplicação. Nenhum serviço externo ou credencial é necessário para os recursos essenciais.

## Começar a estudar

1. Consulte **Edital → Fontes e documentos**. O PDF fornecido está incluído e pode ser aberto integralmente. Confira novas retificações antes de atualizar as regras.
2. Em **Questões**, filtre e selecione os itens da base oficial já incluída. Para consultar sua origem ou baixar o arquivo de importação, abra **Consultar fontes do pacote oficial → Baixar pacote JSON**. A consulta fica indisponível durante sessões com correção adiada, para preservar o sigilo das respostas.
3. Para ampliar a base, importe questões de provas anteriores do Cebraspe/Cespe por CSV/JSON, ou confira um PDF e vincule manualmente cada número de item ao gabarito. Há modelos vazios e instruções para download. Informe o bloco (`p1`, `p2` ou `p3`) e vincule o `topicId` ao edital, também disponível no cadastro manual. Fonte pública e confirmação da prévia são obrigatórias; o aplicativo não autentica automaticamente a origem de novos arquivos.
4. Clique **Começar meu estudo de hoje**. O diagnóstico procura questões nunca apresentadas e distribui a amostra por disciplina. Se só houver itens já vistos, o plano informa a repetição; importe inéditas para uma nova linha de base.
5. Registre Certo, Errado ou branco e a confiança antes de responder. Termine a sessão para consolidar suas métricas e agendar erros, acertos inseguros e itens marcados.
6. Classifique os erros, registre o conceito correto e reveja nas datas agendadas. Intervalos iniciais são configuráveis. Utilize **Configurações → Exportar backup completo** regularmente.

A base oficial é adicionada automaticamente em instalações novas e existentes, preservando questões já cadastradas, favoritos, anotações, gabaritos retificados e histórico. Disponibilizar questões não registra tentativas nem cria resultados de estudo. Os seis exemplos autorais do modo demonstração permanecem separados e não são questões oficiais, nem resultados de Pedro. Estratégia inclui exemplos didáticos autorais fora do banco real.

## Base oficial incluída

São **315 questões oficiais de provas anteriores Cebraspe/Cespe**, vinculadas editorialmente ao edital fornecido para CGU — Desenvolvimento de Sistemas. A versão `2026-10-15.2` acrescenta **237 itens** à base inicial de 78: **201 de aplicação em 2025, 16 de 2026 e 20 de 2024**. O ano registrado é o de aplicação, conforme a fonte indicada; o ano no identificador do edital pode ser anterior. Questões aparecem das mais recentes para as mais antigas em **Questões**.

Há novos itens em **todas as 13 disciplinas**, distribuídos por **94 dos 205 tópicos folha**. Isso descreve disponibilidade do banco; não significa cobertura integral do conteúdo nem domínio do candidato. Auditoria tem quatro itens e Sociedade Brasileira tem nove: ambas ainda exigem ampliação de amostra. A importação não cria tentativas, notas ou revisões; a atualização adiciona itens preservando favoritos, respostas, gabaritos retificados e anotações existentes.

| Disciplina | Total | Novas | Aplicação mais recente |
|---|---:|---:|---:|
| Estado, democracia, direitos e ciência política | 21 | 12 | 2026 |
| Sociedade brasileira, desigualdades, diversidade e desenvolvimento | 9 | 8 | 2026 |
| Ética pública e responsabilidade profissional | 10 | 6 | 2025 |
| Administração pública e fundamentos de políticas públicas | 15 | 8 | 2026 |
| Fundamentos de governança, riscos e integridade pública e privada | 21 | 21 | 2025 |
| Fundamentos de transparência, ouvidoria e participação social | 17 | 14 | 2025 |
| Fundamentos de direito público aplicado, controle e responsabilização | 16 | 10 | 2025 |
| Fundamentos de evidências, dados e inteligência artificial | 13 | 12 | 2025 |
| Fundamentos de auditoria governamental e atuação integrada da cgu | 4 | 4 | 2025 |
| Engenharia de software e programação | 26 | 21 | 2025 |
| Arquitetura e integração de sistemas | 62 | 34 | 2025 |
| Persistência, integração e proteção de dados | 48 | 44 | 2025 |
| Desenvolvimento seguro, qualidade e gestão da entrega | 53 | 43 | 2025 |

A ampliação inclui aplicações de 2025 do STM, SUSEP, FUB, TRF6, TRT10, BDMG, FUNPRESP-EXE e ANM, além do IRBr/CACD 2026. A origem e o cargo de cada item permanecem identificados. Itens de idiomas, legislação local sem aderência, conteúdos de outras especialidades, questões anuladas e múltipla escolha não convertida em C/E foram excluídos. A classificação no edital CGU é editorial, não uma classificação da banca.

### Conferência e atualidade

- **78 itens anteriores:** provas e gabaritos definitivos em PDF conferidos em espelhos públicos dos repositórios `kant-sdev/simucespe` e `SaganGromov/CONCURSOS_2627`.
- **16 novos itens do IRBr/CACD 2026:** prova e gabarito definitivo confrontados nos PDFs preservados por `JSSO0/padrao-embaixador`, em commit fixo, com hashes conferidos. Aplicação em 29/03/2026; itens anulados excluídos.
- **221 novos itens de 2024–2025:** páginas originais preservadas e gabarito de transcrição pública no catálogo `aureovinicius/concursos-cgu`, commit `a14f358db6ba778752242220c867052c54cd92a9`. São 38 imagens de páginas com SHA-256 individual. **O PDF do gabarito definitivo destes 221 itens não foi obtido nem confrontado nesta importação.** Essa limitação aparece na resolução; as chaves não foram geradas por IA.

Acesso direto ao CDN oficial permanece bloqueado por HTTP 403 nesta rede. Ano recente não certifica vigência jurídica nem versão técnica atual. As datas, versões e condições do item são preservadas; uma estatística do Censo Agropecuário de 2017 permanece identificada como histórica. Não foram criados comentários didáticos nem referências automáticas como validação definitiva.

O pacote completo está em `public/question-banks/cebraspe-cgu-ti-v1.json` — o caminho estável mantém compatibilidade; a versão está no conteúdo. URLs oficiais, espelhos fixados, tipos de evidência, hashes e contagens estão em `public/question-banks/cebraspe-cgu-ti-provenance.json`. Os 221 registros públicos selecionados, sem modificações de origem, estão em `public/question-banks/cebraspe-recent-catalog-selection.json`; a apresentação corrige apenas limites de extração, espaços e formatação de código, e restaura situações compartilhadas. As páginas originais são a referência para conferir comandos e elementos visuais.

Consulte **Questões → Consultar fontes do pacote oficial** para distribuição, fontes e download JSON. Gabaritos de sessões com correção adiada ficam ocultos até encerrá-las. Uma retificação local preserva o histórico e recebe indicação de registro manual, sem herdar a conferência da versão anterior.

## Fonte e regras

Fonte documental: **Edital nº 1 — CGU — AFFC, de 8 de outubro de 2026**, PDF enviado pelo usuário e conferido em **14/10/2026**. O arquivo original está em `public/documents/edital-cgu-affc-2026.pdf`; texto, hierarquia, eventos previstos e SHA-256 estão em `src/edital-extraction.json`.

O conteúdo do documento foi conferido. **Publicação, vigência e retificações não foram confirmadas online**: a página pública `https://www.cebraspe.org.br/concursos/cgu_26_affc` retornou HTTP 403. O campo `rules.verified` representa conferência documental, não autenticação do site. Documentos anexados depois continuam pendentes até conferência expressa.

| Elemento | Informação do PDF | Seção |
|---|---|---|
| Especialidade | Cargo 4 — Tecnologia da Informação — Desenvolvimento de Sistemas | 2.1.4 |
| P1 — básicos | 40 itens; +1/−1/0; mínimo 8 | 7.1; 8.11.2; 8.11.4 |
| P2 — complementares | 40 itens; +1/−1/0; mínimo 12 | mesmas seções |
| P3 — específicos | 90 itens; +2/−2/0; mínimo 54 | mesmas seções |
| Objetiva total | 170 itens; máximo 260 pontos; mínimo 78; 5h de manhã | 7.1–7.2; 8.11.4 |
| Anulações | Ganho atribuído a todos; gabaritos alterados recalculam o resultado | 8.12.6.1–8.12.6.2 |
| Discursiva | 3h30 à tarde; Q1 até 30 linhas/30 pontos, Q2 até 60 linhas/70 pontos | 7.3; 9.1 |
| Correção discursiva | NQ1 = max(0, NC−6×NE/TL); NQ2 = max(0, NC−14×NE/TL); total mínimo 50 | 9.7.5–9.7.8 |
| Provas previstas | 13/12/2026; datas podem mudar | Anexo I |

O mapa contém 205 tópicos folha de 13 disciplinas, apenas conteúdo comum e específico do Cargo 4. Os 70 itens pais estão preservados como contexto; não são contados duas vezes na cobertura. Não foram atribuídos pesos nem incidências fictícias por tópico.

O orçamento padrão é 24h semanais. A prova objetiva integral exige 5h contínuas, acima das 4h diárias informadas. O bloco semanal de 2h é treino parcial; um simulado integral requer reservar 5h e redistribuir o restante da agenda. Mínimos não são nota de corte, e não há probabilidade ou promessa de aprovação.

## Cálculos e histórico

- Precisão = acertos / respostas C/E julgáveis; erros = erros / mesmas respostas. Chaves desconhecidas e anulados não viram acertos de conhecimento.
- Omissão = brancos registrados / total de itens selecionados da sessão encerrada. Itens nunca apresentados permanecem separados, inclusive em encerramento por prazo.
- Nota = soma dos ganhos, penalidades e omissões por bloco, com a regra congelada na sessão. Aproveitamento líquido = nota / máximo possível do conjunto selecionado. Notas negativas são preservadas; denominadores zero aparecem sem dados.
- O relógio do simulado usa prazo absoluto e encerra no limite, inclusive após recarregar. Rascunhos apresentados são preservados; itens não apresentados não viram omissões. Relatórios parciais não certificam mínimos oficiais.
- Gabarito atual recalcula os resultados; resposta inicial, alterações, resposta final, versão anterior da chave e regra da sessão permanecem no histórico. Alterações não criam tentativas.
- Notas e gráficos agregados usam sessões encerradas. Histórico também mostra respostas de sessões em andamento/abandonadas, sem transformá-las em notas encerradas. Tempo ativo de estudo pode ser registrado mesmo sem sessão pontuada.
- Período estatístico usa data de encerramento. Questões únicas, tentativas, inéditas/repetidas, confiança, reincidência e retenção têm amostras explícitas.
- Consolidação exige pelo menos 20 únicas julgáveis, 25 respostas, 85% de precisão, líquido histórico ≥60% e recente ≥50%, cinco revisões posteriores com retenção ≥80%, baixa reincidência e nenhuma revisão vencida. São critérios iniciais conservadores de estudo, ajustáveis no motor; não vêm do edital nem estimam aprovação.
- Avaliação discursiva é manual e pedagógica: NC, NE e TL são informados pelo candidato. Linhas visuais da tela não medem TL da folha oficial. Textos, reescritas e versões são preservados.

## Persistência e limites

Histórico e preferências ficam em `localStorage`; PDFs em IndexedDB. A origem/endereço e o navegador definem esse armazenamento. Limpar dados do navegador ou mudar de dispositivo não sincroniza o histórico. Limites de espaço geram aviso; exporte imediatamente se houver falha de salvamento.

Backup completo JSON inclui dados e PDFs importados, além dos PDFs de fontes incorporadas. As imagens das páginas do banco acompanham os arquivos da plataforma; para restaurar em outra instalação, utilize a mesma versão atualizada do projeto. A restauração valida estrutura e documentos antes de substituir dados; exclusão exige confirmação escrita. JSON sem PDFs e CSV do histórico também estão disponíveis. Em recuperação de dados corrompidos, o armazenamento original é preservado para exportação.

PDFs exigem conferência humana da ordem do texto, imagens, tabelas, código e correspondência com o gabarito. O original é guardado; o simulado mostra somente a página vinculada ao enunciado. Não vincule uma página que contenha o gabarito. Comentários importados têm autoria e validação separadas; comentários de IA não ganham validação definitiva automaticamente.

Para sincronização/autenticação ou IA futuramente, será necessário backend e configuração explícita. Chaves não devem ser colocadas no cliente. O fluxo principal atual não depende dessas integrações.
