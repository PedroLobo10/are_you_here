import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Check, Calculator, AlertTriangle, Target } from 'lucide-react';
import type { ModuleProps } from '../types';
import { calculateStats } from '../core';

const patterns = [
  { id: 'scope', title: 'Escopo e exceções', label: '01', item: 'Toda tabela de um banco de dados relacional deve ter, obrigatoriamente, uma chave estrangeira.', answer: 'Errado', explanation: 'Uma chave estrangeira estabelece uma referência entre tabelas. Uma tabela pode existir sem esse relacionamento. O quantificador “toda” amplia a afirmação além do que o modelo exige.', counter: 'Uma tabela isolada de parâmetros, com chave primária e sem relacionamento, é um contraexemplo.', guidance: 'Determine o universo da afirmação e procure um caso válido que viole a exigência. “Toda” merece análise; a palavra sozinha não define o gabarito.' },
  { id: 'equivalence', title: 'Conceitos parecidos não são equivalentes', label: '02', item: 'Autenticação e autorização são equivalentes, pois ambas determinam quais recursos um usuário pode acessar.', answer: 'Errado', explanation: 'Autenticação verifica a identidade apresentada. Autorização decide o acesso a recursos e ações. Elas colaboram em um sistema, mas resolvem perguntas diferentes.', counter: 'Um usuário pode estar autenticado e ainda assim não ter autorização para excluir um registro.', guidance: 'Substitua cada termo por sua definição. Verifique se a propriedade pertence realmente aos dois conceitos.' },
  { id: 'cause', title: 'Causa e consequência', label: '03', item: 'Se uma consulta SQL ficou lenta, então a ausência de um índice é necessariamente a causa dessa lentidão.', answer: 'Errado', explanation: 'Índices podem melhorar consultas, mas lentidão também pode resultar de bloqueios, volume de dados, plano de execução inadequado ou recursos insuficientes. O sintoma não prova uma causa única.', counter: 'Uma consulta com índices adequados pode aguardar uma transação que mantém um bloqueio.', guidance: 'Pergunte se a causa apontada é suficiente, necessária ou apenas possível. Investigue alternativas antes de aceitar uma causalidade.' },
  { id: 'necessary', title: 'Condição necessária e suficiente', label: '04', item: 'Uma função ser recursiva é condição suficiente para que sua execução termine.', answer: 'Errado', explanation: 'Recursão descreve uma função que chama a si própria, direta ou indiretamente. A terminação exige condições adicionais, como um caso base alcançável e progresso em direção a ele.', counter: 'Uma função f() que apenas chama f() novamente não termina normalmente.', guidance: 'Na forma “A implica B”, teste se A pode ocorrer sem B. Não troque uma condição que ajuda por uma garantia.' },
  { id: 'negation', title: 'Negação e quantificadores', label: '05', item: 'A negação de “todos os testes passaram” é “nenhum teste passou”.', answer: 'Errado', explanation: 'A negação de uma afirmação universal é existencial: “pelo menos um teste não passou”. “Nenhum passou” é uma afirmação mais forte.', counter: 'Se nove testes passaram e um falhou, a afirmação original é falsa, mas “nenhum passou” também é falsa.', guidance: 'Formalize: ¬∀x P(x) equivale a ∃x ¬P(x). Ao negar, preserve exatamente a força lógica necessária.' },
  { id: 'generalization', title: 'Generalização e restrição indevida', label: '06', item: 'Somente aplicações que acessam dados pela internet estão sujeitas a falhas de segurança.', answer: 'Errado', explanation: 'Aplicações locais também podem conter falhas, como processamento inseguro de arquivos, controle de acesso inadequado ou permissões excessivas. A restrição “somente” exclui casos válidos.', counter: 'Um editor local vulnerável pode executar código ao abrir um arquivo malicioso, mesmo sem conexão de rede.', guidance: 'Identifique o que a frase exclui. Busque casos fora do conjunto permitido sem presumir que “somente” torna qualquer item errado.' },
  { id: 'versions', title: 'Versão e contexto tecnológico', label: '07', item: 'Em Python 3, a expressão 5 / 2 resulta em 2.5.', answer: 'Certo', explanation: 'Em Python 3, / realiza divisão real. Para os operandos inteiros apresentados, o resultado é o número de ponto flutuante 2.5. A operação // é divisão pelo piso e produz 2 neste exemplo.', counter: 'A expressão 5 // 2 produz 2. Uma mudança no operador altera o resultado; versões antigas da linguagem também exigem outro contexto.', guidance: 'Leia linguagem, versão, tipos e operadores. Confirme detalhes em documentação da versão citada; não aplique uma lembrança de outro ambiente.', reference: 'https://docs.python.org/3/reference/expressions.html#binary-arithmetic-operations' },
  { id: 'assumptions', title: 'Condições que o enunciado não fornece', label: '08', item: 'Ao encontrar um vetor ordenado, um algoritmo executará obrigatoriamente uma busca binária para localizar um elemento.', answer: 'Errado', explanation: 'Um vetor estar ordenado permite o uso de busca binária, mas não obriga o algoritmo a escolher essa estratégia. A afirmação acrescenta uma decisão que não foi fornecida.', counter: 'Uma busca sequencial também pode percorrer um vetor ordenado.', guidance: 'Separe fatos dados de hipóteses adicionadas por você. Uma estratégia possível não é uma descrição obrigatória da execução.' },
];

function number(value: number) { return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }

export default function Strategy({ state }: ModuleProps) {
  const [tab, setTab] = useState<'patterns' | 'decision'>('patterns');
  const [expanded, setExpanded] = useState<string | null>('scope');
  const [revealed, setRevealed] = useState<string[]>([]);
  const [probability, setProbability] = useState(60);
  const [selectedBlock, setSelectedBlock] = useState(state.rules.blocks[0]?.id ?? '');
  const block = state.rules.blocks.find(b => b.id === selectedBlock) ?? state.rules.blocks[0];
  const gain = block?.gain ?? 1;
  const penalty = Math.abs(block?.penalty ?? 1);
  const omission = block?.omission ?? 0;
  const expected = probability / 100 * gain - (1 - probability / 100) * penalty;
  const threshold = gain + penalty > 0 ? penalty / (gain + penalty) * 100 : null;
  const comparisonThreshold = gain + penalty > 0 ? (penalty + omission) / (gain + penalty) * 100 : null;
  const calibration = useMemo(() => calculateStats(state, { isDemo: state.demoMode }).confidenceBands
    .map(band => ({ min: band.from, max: band.to, sample: band.attempts, correct: band.correct, accuracy: band.accuracy === null ? null : band.accuracy * 100 })), [state]);
  const matchedCalibration = calibration.find(b => probability >= b.min && probability <= b.max);

  return <div>
    <div className="page-header"><div><p className="eyebrow">LER COM PRECISÃO · DECIDIR COM EVIDÊNCIAS</p><h1>Estratégia Cebraspe</h1><p className="muted">Entenda o que o item afirma. A resposta vem do conceito e das condições.</p></div><span className="badge"><BookOpen size={14} /> Centro de treinamento</span></div>
    <div className="toolbar" role="tablist" aria-label="Áreas de estratégia" style={{ marginBottom: 24 }}>
      <button role="tab" aria-selected={tab === 'patterns'} className={`button ${tab === 'patterns' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('patterns')}><BookOpen size={16} /> Leitura e padrões</button>
      <button role="tab" aria-selected={tab === 'decision'} className={`button ${tab === 'decision' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('decision')}><Calculator size={16} /> Responder ou deixar em branco</button>
    </div>
    {tab === 'patterns' ? <>
      <div className="card" style={{ padding: 24, marginBottom: 24, background: 'var(--accent-soft, #f5f2ff)' }}>
        <h2 style={{ marginTop: 0 }}>O enunciado é o ponto de partida</h2><p>Delimite a afirmação, confira suas condições e teste o conceito. Estes exemplos são <strong>autorais educativos</strong>, separados do banco de questões e do seu histórico de desempenho.</p>
        <p className="muted" style={{ marginBottom: 0 }}>Catálogo expansível de padrões de leitura. Sem base oficial identificada, não atribuímos frequência ou incidência a esses padrões.</p>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {patterns.map(pattern => <article key={pattern.id} className="card" style={{ overflow: 'hidden' }}>
            <button className="strategy-disclosure" onClick={() => setExpanded(expanded === pattern.id ? null : pattern.id)} aria-expanded={expanded === pattern.id} aria-controls={`pattern-${pattern.id}`} style={{ width: '100%', border: 0, padding: '20px 22px', background: 'transparent', color: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', font: 'inherit' }}>
              <span className="badge" style={{ minWidth: 36 }}>{pattern.label}</span><strong style={{ flex: 1 }}>{pattern.title}</strong><ChevronDown size={18} style={{ transform: expanded === pattern.id ? 'rotate(180deg)' : undefined }} />
            </button>
            {expanded === pattern.id && <div id={`pattern-${pattern.id}`} style={{ padding: '0 22px 22px' }}>
              <span className="badge">Exemplo autoral educativo</span><blockquote style={{ margin: '16px 0', borderLeft: '3px solid var(--accent, #7654cd)', padding: '4px 16px', lineHeight: 1.75 }}>{pattern.item}</blockquote>
              {!revealed.includes(pattern.id) ? <button className="button button-primary" onClick={() => setRevealed([...revealed, pattern.id])}>Ver gabarito e raciocínio</button> : <>
                <p><strong><Check size={15} style={{ verticalAlign: 'middle' }} /> Gabarito educativo: {pattern.answer}</strong></p><p>{pattern.explanation}</p>
                <h3>Contraexemplo ou contraste</h3><p className="muted">{pattern.counter}</p><h3>Como ler</h3><p>{pattern.guidance}</p>
                {'reference' in pattern && pattern.reference && <a href={pattern.reference} target="_blank" rel="noreferrer">Referência: documentação oficial do Python ↗</a>}
              </>}
            </div>}
          </article>)}
        </div>
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Target size={20} /><h2>Um roteiro para cada item</h2></div><ol style={{ paddingLeft: 22, lineHeight: 2 }}><li>Qual é exatamente a afirmação?</li><li>Qual é o contexto, a versão e o escopo?</li><li>Quais condições foram fornecidas?</li><li>Há um contraexemplo válido?</li><li>Estou lembrando o conceito ou apenas o vocabulário?</li></ol><p className="muted">No modo de interpretação, registre sua análise antes de responder. Na correção, confronte-a com o gabarito e a referência.</p></div>
          <div className="card" style={{ padding: 24 }}><h2>Regras de leitura, sem superstição</h2><ul style={{ paddingLeft: 20, lineHeight: 1.85 }}><li>“Sempre”, “nunca”, “somente” e “todos” exigem atenção; não determinam o gabarito.</li><li>Um item longo não é necessariamente errado.</li><li>Não presuma distribuição de 50% de itens certos e 50% errados.</li><li>Sequências de gabarito não permitem prever a próxima resposta.</li><li>Reconhecer palavras não demonstra domínio do conceito.</li></ul></div>
          <div className="card" style={{ padding: 24 }}><h2>Como transformar o erro em aprendizado</h2><p>Escreva a regra correta em uma frase, identifique a condição que você ignorou e procure uma questão oficial sobre o mesmo conceito.</p><p className="muted">Após a correção, classifique o erro e agende uma revisão. Os padrões desta página não são regras do edital.</p></div>
        </div>
      </div>
    </> : <>
      {!state.rules.verified && <div className="card" style={{ padding: '18px 22px', marginBottom: 24 }}><p style={{ margin: 0 }}><AlertTriangle size={17} style={{ verticalAlign: 'middle' }} /> <strong>Regras provisórias.</strong> O simulador usa os valores da configuração atual. Confirme pesos, penalidades e omissão no edital antes de tomar decisões de prova.</p></div>}
      <div className="grid-2">
        <div className="card" style={{ padding: 26 }}><p className="eyebrow">SIMULADOR EDUCATIVO</p><h2>Uma decisão, três resultados</h2>
          <label className="field">Bloco da regra de estudo<select value={block?.id ?? ''} onChange={e => setSelectedBlock(e.target.value)}>{state.rules.blocks.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
          <label className="field" style={{ marginTop: 22 }}>Probabilidade hipotética de acerto <strong style={{ fontSize: 26 }}>{probability}%</strong><input type="range" min="0" max="100" step="1" value={probability} onChange={e => setProbability(Number(e.target.value))} aria-label="Probabilidade hipotética de acerto" /></label>
          <p className="muted">Este controle representa uma hipótese matemática. Sua confiança subjetiva não é automaticamente uma probabilidade real.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '24px 0' }}>{[{ label: 'Acerto', value: `+${number(gain)}` }, { label: 'Erro', value: `−${number(penalty)}` }, { label: 'Omissão', value: number(omission) }].map(x => <div key={x.label} style={{ border: '1px solid var(--border, #ebe8f0)', borderRadius: 12, padding: 14 }}><small className="muted">{x.label}</small><p style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 0' }}>{x.value}</p></div>)}</div>
          <div style={{ background: 'var(--accent-soft, #f5f2ff)', borderRadius: 14, padding: 22 }}><p style={{ margin: '0 0 8px' }}>Valor esperado de responder</p><strong style={{ fontSize: 34, color: 'var(--accent, #7654cd)' }}>{expected > 0 ? '+' : ''}{number(expected)} ponto{Math.abs(expected) === 1 ? '' : 's'}</strong><p style={{ marginBottom: 0 }}>{probability / 100} × {number(gain)} − {number(1 - probability / 100)} × {number(penalty)}</p></div>
          <p><strong>Fórmula:</strong> p × ganho − (1 − p) × penalidade.</p>
          {threshold !== null ? <p>O valor esperado fica positivo quando a probabilidade real supera <strong>{number(threshold)}%</strong>. {gain === penalty && gain > 0 ? 'Com ganho e penalidade de mesma magnitude, esse limiar é 50%.' : 'O limiar depende dos pesos aplicáveis.'}</p> : <p>Sem ganho ou penalidade, não há limiar definido por essa fórmula.</p>}
          {omission !== 0 && <p>Como a omissão vale {number(omission)} ponto(s), comparar responder a omitir exige superar esse valor esperado{comparisonThreshold !== null ? `; o limiar relativo à omissão é ${number(comparisonThreshold)}%.` : '.'}</p>}
          <p className="muted">Valor esperado descreve uma média em muitas decisões comparáveis. Não garante pontuação positiva em um item nem aprovação. Tempo restante, mínimos por bloco e variabilidade também importam; a fórmula não é uma ordem universal para chutar.</p>
        </div>
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <div className="card" style={{ padding: 26 }}><p className="eyebrow">CALIBRAÇÃO · {state.demoMode ? 'DEMONSTRAÇÃO' : 'DADOS REAIS'}</p><h2>Confiança versus resultado</h2><p className="muted">Respostas C/E de sessões concluídas com confiança registrada. Itens sem gabarito, anulados ou sem confiança declarada ficam fora. As respostas são reavaliadas pelo gabarito atual.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left', padding: '12px 0' }}>Confiança</th><th>Amostra</th><th>Acerto observado</th></tr></thead><tbody>{calibration.map(b => <tr key={b.min} style={{ borderTop: '1px solid var(--border, #ebe8f0)' }}><td style={{ padding: '15px 0' }}>{b.min}–{b.max}%</td><td style={{ textAlign: 'center' }}>{b.sample}</td><td style={{ textAlign: 'center' }}>{b.accuracy === null ? 'Sem dados' : `${number(b.accuracy)}%`}</td></tr>)}</tbody></table>
            <p className="muted">Tentativas repetidas podem estar correlacionadas. A amostra observada não estabelece uma probabilidade válida para qualquer novo item.</p>
            {matchedCalibration?.accuracy !== null && matchedCalibration && matchedCalibration.sample > 0 ? <div style={{ padding: 16, borderRadius: 12, background: 'var(--accent-soft, #f5f2ff)' }}><strong>Na faixa {matchedCalibration.min}–{matchedCalibration.max}%</strong><p style={{ marginBottom: 0 }}>Você acertou {matchedCalibration.correct} de {matchedCalibration.sample} respostas válidas. {matchedCalibration.sample < 30 ? 'Há poucos dados para uma conclusão estável. Continue registrando confiança antes de responder.' : 'Use essa comparação como evidência local e observe mudanças conforme o assunto e a dificuldade.'}</p></div> : <div className="empty-state" style={{ padding: 20 }}><p>Registre confiança antes de responder e encerre uma sessão para começar a avaliar sua calibração.</p></div>}
          </div>
          <div className="card" style={{ padding: 24 }}><h2>Depois do simulado</h2><p>Priorize erros com alta confiança e acertos inseguros. Compare também mudanças de resposta e tempo gasto em itens sem ganho.</p><p className="muted">Uma resposta de diagnóstico dada após omitir um item permanece separada da nota original. Examine o conceito sem reescrever o resultado da prova.</p></div>
        </div>
      </div>
    </>}
  </div>;
}
