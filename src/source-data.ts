import type { ExamRules, Question, SourceRecord, Topic } from './types';
import extraction from './edital-extraction.json';

const officialUrl = 'https://www.cebraspe.org.br/concursos/cgu_26_affc';
const consultedAt = '2026-10-14';

export const sourceRecords: SourceRecord[] = [{
  id: 'official-cgu-26-affc',
  title: 'Página oficial indicada: CGU / Cebraspe',
  url: officialUrl,
  consultedAt,
  status: 'unavailable',
  detail: 'A consulta pública falhou com HTTP 403 na rede deste ambiente. A publicação oficial, a vigência e as retificações não foram verificadas online. Posteriormente, o usuário forneceu um PDF cujo conteúdo está disponível e foi conferido nesta plataforma; esse arquivo não comprova a ausência de retificações.',
}, {
  id: 'user-edital-cgu-affc-2026',
  title: 'Edital nº 1 – CGU – AFFC, de 8 de outubro de 2026 · PDF fornecido pelo usuário',
  url: officialUrl,
  assetUrl: '/documents/edital-cgu-affc-2026.pdf',
  consultedAt,
  status: 'uploaded',
  fileName: 'edital-cgu-affc-2026.pdf',
  extractedText: extraction.extractedText,
  detail: 'Conteúdo conferido no PDF fornecido pelo usuário (69 páginas; SHA-256 d4ccc50d4fdff5345ce197658eb60ba0afa85bc841d9aef1b265900c71653985). Especialidade no item 2.1.4; estrutura e duração no item 7; pontuação e mínimos em 8.11; anulados em 8.12.6.1; discursivas no item 9; conteúdo em 15.2.2, 15.2.3 e Cargo 4 de 15.2.4; cronograma previsto no Anexo I. Autenticidade da publicação, vigência e retificações permanecem NÃO CONFIRMADAS ONLINE. Datas são previstas e podem ser alteradas.',
}];

export const initialRules: ExamRules = {
  version: 'Edital nº 1 – CGU – AFFC – 08/10/2026 · PDF fornecido',
  verified: true,
  specialty: 'Tecnologia da Informação – Desenvolvimento de Sistemas',
  sourceUrl: officialUrl,
  sourceName: 'Edital nº 1 CGU/AFFC, 08/10/2026 — PDF fornecido pelo usuário',
  consultedAt,
  blocks: [
    { id: 'p1', name: 'P1 · Conhecimentos básicos', items: 40, gain: 1, penalty: 1, omission: 0, minimum: 8, annulled: 'award' },
    { id: 'p2', name: 'P2 · Conhecimentos complementares', items: 40, gain: 1, penalty: 1, omission: 0, minimum: 12, annulled: 'award' },
    { id: 'p3', name: 'P3 · Conhecimentos específicos', items: 90, gain: 2, penalty: 2, omission: 0, minimum: 54, annulled: 'award' },
  ],
  totalMinimum: 78,
  durationMinutes: 300,
  dates: extraction.dates,
  writingRules: 'P4: 100 pontos; 3h30 no turno da tarde (7.3). Questão de conhecimentos complementares: até 30 linhas, 30 pontos (9.1 a); NQ1 = max(0, NC − 6 × NE ÷ TL) (9.7.5). Situação-problema de conhecimentos específicos: até 60 linhas, 70 pontos (9.1 b); NQ2 = max(0, NC − 14 × NE ÷ TL) (9.7.6). NC: apresentação, estrutura e domínio do conteúdo; NE: erros de grafia, morfossintaxe e propriedade vocabular; TL: linhas efetivamente escritas na folha oficial. Fragmentos fora do local ou acima do limite não são avaliados. Sem texto ou fuga ao tema: zero. NFPD = NQ1 + NQ2; mínimo 50 pontos (9.7.7–9.7.8). Texto dissertativo manuscrito com caneta preta em material transparente, sem identificação indevida; somente documento definitivo vale (9.3–9.6). Apenas candidatos aprovados conforme classificação/quantitativos das objetivas têm discursivas corrigidas (9.7.1, 8.11.5–8.11.5.2). A tela não reproduz o número oficial de linhas. Fórmulas do PDF conferidas; avaliações de conteúdo feitas na plataforma são pedagógicas, não oficiais.',
  writingConfig: {
    version: 'Edital nº 1 – CGU – AFFC – 08/10/2026 · PDF fornecido',
    sourceName: 'Edital nº 1 CGU/AFFC, 08/10/2026 — PDF fornecido pelo usuário',
    sourceUrl: officialUrl,
    consultedAt,
    verified: true,
    durationMinutes: 210,
    minimum: 50,
    parts: [
      { id: 'q1', label: 'Questão de conhecimentos complementares', maximum: 30, maximumLines: 30, languagePenalty: 6, section: '9.1(a), 9.7.5' },
      { id: 'q2', label: 'Situação-problema de conhecimentos específicos', maximum: 70, maximumLines: 60, languagePenalty: 14, section: '9.1(b), 9.7.6' },
    ],
  },
  notes: 'Regras CONFERIDAS NO PDF FORNECIDO; autenticidade da publicação, vigência e retificações NÃO CONFIRMADAS ONLINE (página pública retornou HTTP 403 em 14/10/2026). Cargo 4: Auditor Federal de Finanças e Controle (AFFC) — Especialidade: Tecnologia da Informação — Desenvolvimento de Sistemas (2.1.4). Objetivas: 170 itens, máximo 260 pontos (7.1, 8.1), 5h no turno da manhã (7.2); discursiva: 3h30 à tarde (7.3), não somadas no cronômetro objetivo. P1/P2 ±1; P3 ±2; branco e dupla marcação zero (8.11.2). Elimina se P1 <8, P2 <12, P3 <54 ou soma <78 (8.11.4); atingir esses mínimos NÃO garante classificação: há quantitativos e ordenação em 8.11.5. Item anulado recebe seu ganho para todos e permanece na pontuação máxima (8.12.6.1); mudança de gabarito vale para todos (8.12.6.2). Conteúdo comum: 15.2.2/15.2.3; específico: 15.2.4 somente Cargo 4. Não há pesos ou frequências oficiais por tópico publicados nesse conteúdo: peso do item decorre do bloco. Datas do Anexo I são PREVISTAS, passíveis de alteração, e horários são de Brasília (UTC−3). Provas previstas em 13/12/2026. A plataforma preserva a versão das regras em cada sessão e separa demonstrações do histórico real.',
};

// Taxonomy is checked against the supplied document; publication and amendments remain unverified online.
export const initialTopics: Topic[] = extraction.topics as Topic[];

const makeDemo = (id: string, statement: string, answer: 'C' | 'E', discipline: string, topic: string, direct: string, steps: string[], reference: string, extra: Partial<Question> = {}): Question => ({
  id,
  statement,
  board: 'Demonstração',
  organization: 'Laboratório de estudo',
  role: 'Exemplo de funcionamento; sem vínculo com uma prova',
  year: null,
  discipline,
  topic,
  block: 'general',
  origin: 'demo',
  source: 'Exemplo autoral de demonstração. Não é questão oficial do Cebraspe e não integra o histórico real.',
  answer,
  keyStatus: 'final',
  keyVersion: 1,
  keyHistory: [{ version: 1, answer, status: 'final', date: consultedAt, source: 'Gabarito educativo do exemplo; não oficial.' }],
  explanation: {
    direct,
    steps,
    concept: topic,
    summary: direct,
    reference,
    author: 'demo',
    validated: false,
  },
  favorite: false,
  importedAt: `${consultedAt}T00:00:00Z`,
  isDemo: true,
  ...extra,
});

export const initialQuestions: Question[] = [
  makeDemo('demo-sql-null', 'Em SQL, a expressão NULL = NULL resulta em verdadeiro.', 'E', 'Banco de dados · exemplo', 'Valores nulos', 'Comparações comuns com NULL produzem UNKNOWN, e não TRUE. Para testar ausência de valor, use IS NULL.', ['NULL representa um valor desconhecido.', 'A igualdade entre valores desconhecidos não permite concluir que são iguais.', 'A condição de um WHERE precisa resultar em TRUE; UNKNOWN não seleciona a linha.'], 'PostgreSQL — Comparison Functions and Operators: https://www.postgresql.org/docs/current/functions-comparison.html', { explanation: { direct: 'NULL = NULL resulta em UNKNOWN, e não TRUE.', steps: ['NULL representa um valor desconhecido.', 'Comparações ordinárias com NULL produzem resultado nulo (UNKNOWN).', 'Use IS NULL ou IS NOT DISTINCT FROM conforme o teste desejado.'], decisive: 'resulta em verdadeiro', concept: 'Lógica de três valores', whyWrong: 'O resultado da comparação não é verdadeiro.', rewrite: 'Em SQL, a expressão NULL = NULL resulta em UNKNOWN.', summary: 'NULL: teste ausência com IS NULL; igualdade comum não resolve valores desconhecidos.', reference: 'PostgreSQL — Comparison Functions and Operators: https://www.postgresql.org/docs/current/functions-comparison.html', author: 'demo', validated: false } }),
  makeDemo('demo-http-get', 'No protocolo HTTP, GET é definido como um método seguro: o cliente não solicita uma alteração de estado no servidor por meio da semântica desse método.', 'C', 'Desenvolvimento de sistemas · exemplo', 'Semântica HTTP', 'GET é um método seguro segundo a semântica HTTP. Efeitos incidentais, como registrar acesso, não tornam o método inseguro por si mesmos.', ['Seguro descreve o efeito solicitado pelo cliente.', 'A semântica de GET pede uma representação do recurso.', 'Logs e outras consequências incidentais podem ocorrer.'], 'RFC 9110, seção 9.2.1 — Safe Methods: https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1'),
  makeDemo('demo-binary-search', 'A busca binária convencional pode ser aplicada corretamente a qualquer sequência, mesmo quando os elementos não estão ordenados segundo a comparação utilizada.', 'E', 'Algoritmos · exemplo', 'Busca binária', 'A busca binária depende da ordenação ou de uma propriedade monotônica compatível com a comparação usada.', ['O algoritmo compara o alvo ao elemento central.', 'Ele elimina metade do espaço com base na ordenação.', 'Sem essa propriedade, o alvo pode estar justamente na metade descartada.'], 'Python — bisect, Array bisection algorithm: https://docs.python.org/3/library/bisect.html', { explanation: { direct: 'A busca binária convencional exige ordenação compatível com a comparação.', steps: ['Considere [3, 1, 2] e procure 3.', 'O centro contém 1: a busca pode descartar a metade esquerda.', 'O valor 3 estava na metade descartada; a premissa de ordenação falhou.'], decisive: 'mesmo quando os elementos não estão ordenados', concept: 'Pré-condições de busca binária', whyWrong: 'A eliminação de metade dos elementos perde sua justificativa.', rewrite: 'A busca binária convencional pode ser aplicada a uma sequência ordenada segundo a comparação utilizada.', summary: 'Verifique as pré-condições antes de escolher o algoritmo.', reference: 'Python — bisect: https://docs.python.org/3/library/bisect.html', author: 'demo', validated: false } }),
  makeDemo('demo-python-range', 'O trecho Python apresentado imprime o valor 6.', 'C', 'Programação · exemplo', 'Laços e acumulação', 'range(4) produz 0, 1, 2 e 3; sua soma é 6.', ['O acumulador começa em 0.', 'Os valores visitados são 0, 1, 2 e 3; o limite 4 não é incluído.', 'Após as somas, total vale 6.'], 'Python — The range type: https://docs.python.org/3/library/stdtypes.html#ranges', { code: 'total = 0\nfor i in range(4):\n    total += i\nprint(total)', language: 'python' }),
  makeDemo('demo-sql-count', 'Em SQL, COUNT(coluna) contabiliza os valores não nulos da coluna no conjunto de linhas considerado.', 'C', 'Banco de dados · exemplo', 'Funções de agregação', 'COUNT(coluna) conta as entradas não nulas. COUNT(*) conta linhas, inclusive aquelas cuja coluna seja nula.', ['Considere os valores 10, NULL e 20.', 'COUNT(coluna) retorna 2.', 'COUNT(*) sobre essas três linhas retorna 3.'], 'PostgreSQL — Aggregate Functions: https://www.postgresql.org/docs/current/functions-aggregate.html'),
  makeDemo('demo-http-idempotent', 'Um método HTTP idempotente exige que todas as respostas a requisições repetidas sejam idênticas, inclusive o código de status.', 'E', 'Desenvolvimento de sistemas · exemplo', 'Idempotência HTTP', 'Idempotência se refere ao efeito pretendido sobre o servidor. As respostas podem diferir entre repetições.', ['A primeira requisição DELETE pode remover um recurso.', 'Uma segunda DELETE pode encontrar o recurso já ausente.', 'O estado final pretendido é o mesmo, ainda que o status retornado mude.'], 'RFC 9110, seção 9.2.2 — Idempotent Methods: https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2'),
];
