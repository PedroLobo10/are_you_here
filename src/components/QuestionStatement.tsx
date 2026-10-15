import { useState } from 'react';
import type { Question } from '../types';
import type { CSSProperties } from 'react';

export type StatementPart = { kind: 'text'; text: string } | { kind: 'code'; text: string; language?: string };

/** Fences are the only parsed markup. Everything else stays escaped React text. */
export function parseQuestionStatement(statement: string): StatementPart[] {
  const parts: StatementPart[] = [];
  const opening = /^[ \t]{0,3}(`{3,}|~{3,})([a-z0-9_+.-]*)[ \t]*\r?$/gim;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(statement)) !== null) {
    const fence = match[1];
    const closing = new RegExp(`^[ \\t]{0,3}${fence[0]}{${fence.length},}[ \\t]*\\r?$`, 'gm');
    const codeStart = match.index + match[0].length + (statement[match.index + match[0].length] === '\n' ? 1 : 0);
    closing.lastIndex = codeStart;
    const end = closing.exec(statement);
    if (!end) break; // Preserve malformed or incomplete input verbatim.
    if (match.index > cursor) parts.push({ kind: 'text', text: statement.slice(cursor, match.index) });
    parts.push({ kind: 'code', text: statement.slice(codeStart, end.index).replace(/\r?\n$/, ''), ...(match[2] ? { language: match[2] } : {}) });
    cursor = end.index + end[0].length;
    opening.lastIndex = cursor;
  }
  if (cursor < statement.length) parts.push({ kind: 'text', text: statement.slice(cursor) });
  return parts;
}

const colors: Record<string, CSSProperties> = {
  string: { color: '#b7e3a7' }, comment: { color: '#abbcc9' }, number: { color: '#f4cc94' }, keyword: { color: '#cfbcff' }, property: { color: '#90d6f1' },
};
const keywords = /^(?:const|let|var|function|return|if|else|elif|for|while|class|public|private|protected|static|void|int|double|float|boolean|String|new|null|true|false|SELECT|FROM|WHERE|JOIN|GROUP|BY|ORDER|AND|OR|NOT|def|print|None|True|False|import|from|as|in|is|and|or|not|async|await|throw|throws|try|catch|finally|extends|implements|this|super|package|interface|switch|case|break|continue)$/;

export function HighlightedCode({ code, language }: { code: string; language?: string }) {
  const pieces = code.split(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/[^\n]*|#[^\n]*|\b(?:const|let|var|function|return|if|else|elif|for|while|class|public|private|protected|static|void|int|double|float|boolean|String|new|null|true|false|SELECT|FROM|WHERE|JOIN|GROUP|BY|ORDER|AND|OR|NOT|def|print|None|True|False|import|from|as|in|is|and|or|not|async|await|throw|throws|try|catch|finally|extends|implements|this|super|package|interface|switch|case|break|continue)\b|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w-]*(?=\s*:(?:\s|$)))/g);
  return <div className="question-source-code" style={{ background: '#16232f', color: '#e3eaf1', borderRadius: 8, margin: '18px 0', overflow: 'hidden', textAlign: 'left' }}>
    <div style={{ fontSize: 11, padding: '9px 15px', borderBottom: '1px solid #394958', color: '#c0ceda' }}>{language || 'Código do enunciado'}</div>
    <pre style={{ margin: 0, padding: 16, overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.7, fontSize: 13, fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace' }}><code data-language={language}>{pieces.map((piece, index) => {
      const kind = /^["']/.test(piece) ? 'string' : /^(\/\/|#)/.test(piece) ? 'comment' : /^\d/.test(piece) ? 'number' : keywords.test(piece) ? 'keyword' : /^[A-Za-z_][\w-]*$/.test(piece) ? 'property' : '';
      return kind ? <span key={index} style={colors[kind]}>{piece}</span> : piece;
    })}</code></pre>
  </div>;
}

function QuestionEvidence({ question }: { question: Question }) {
  const [open, setOpen] = useState(false);
  const hasPages = Boolean(question.originalPages?.length);
  return <>
    {question.keyVerification && <div className="question-evidence" style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, margin: '14px 0', fontSize: 12, overflowWrap: 'anywhere' }}>
      <strong>{question.keyVerification === 'pdf-checked' ? 'Gabarito confrontado com o PDF definitivo.' : question.keyVerification === 'user-recorded' ? 'Gabarito retificado localmente; confira a referência registrada nesta versão.' : 'Gabarito de transcrição pública identificada; PDF definitivo ainda não conferido nesta importação.'}</strong>
      <p style={{ margin: '6px 0' }}>Prova de {question.year} · Fonte consultada em {question.sourceVerifiedAt?.slice(0, 10).split('-').reverse().join('/') || 'data não informada'}.
        {question.yearBasis === 'catalog-application' && ' Ano de aplicação informado no catálogo público.'}</p>
      <p style={{ margin: '6px 0' }}>{question.contentCurrentness === 'historical-statistic' ? 'O indicador mantém o período original citado na questão; não representa uma estatística atual.' : question.contentCurrentness === 'version-specific' ? 'Resolva considerando a versão explicitada no item. Outras versões podem ter comportamento diferente.' : 'A data da prova não comprova vigência atual de normas ou versões de tecnologias; preserve o contexto do item.'}</p>
      {question.sourceVerification && <details><summary>Escopo da conferência</summary><p>{question.sourceVerification}</p></details>}
    </div>}
    {hasPages && <details className="original-question-pages" onToggle={event => setOpen(event.currentTarget.open)} style={{ margin: '16px 0', maxWidth: '100%' }}>
      <summary>Conferir enunciado original · item {question.itemNumber} · {question.originalPages!.length} página(s)</summary>
      <p className="muted small">A transcrição é auxiliar. Leia o comando e o item indicado na reprodução original; as páginas de apoio preservam situações, tabelas, imagens e códigos. Abra a imagem para ampliar.</p>
      {open && question.originalPages!.map(page => <figure key={page.assetUrl} style={{ margin: '12px 0' }}>
        <figcaption>Página {page.page}{page.support ? ' · contexto de apoio' : ` · localize o item ${question.itemNumber}`}</figcaption>
        <a href={page.assetUrl} target="_blank" rel="noreferrer" aria-label={`Ampliar página ${page.page} do item ${question.itemNumber}`}><img src={page.assetUrl} alt={`Reprodução da página ${page.page} da prova Cebraspe; responda ao item ${question.itemNumber}`} loading="lazy" style={{ width: '100%', height: 'auto', border: '1px solid var(--border)' }}/></a>
      </figure>)}
    </details>}
  </>;
}

export default function QuestionStatement({ statement, code, language, className = '', question }: { statement: string; code?: string; language?: string; className?: string; question?: Question }) {
  return <div className={`question-statement-body ${className}`.trim()}>
    {parseQuestionStatement(statement).map((part, index) => part.kind === 'code'
      ? <HighlightedCode key={index} code={part.text} language={part.language || language}/>
      : <p key={index} className="question-statement" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{part.text}</p>)}
    {code !== undefined && code !== '' && <HighlightedCode code={code} language={language}/>}
    {question && <QuestionEvidence question={question}/>}
  </div>;
}
