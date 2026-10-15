import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QuestionStatement, { parseQuestionStatement } from '../src/components/QuestionStatement';

describe('question statement source order and safe code rendering', () => {
  it('preserves context, Java program and the claim below the program in that order', () => {
    const statement = 'Considere o código Java a seguir.\n\n```java\npublic class Teste {\n  int valor = 3 + 3;\n}\n```\n\nA execução apresentará o valor 6.';
    const parts = parseQuestionStatement(statement);
    expect(parts.map(part => part.kind)).toEqual(['text', 'code', 'text']);
    expect(parts[1]).toEqual({ kind: 'code', language: 'java', text: 'public class Teste {\n  int valor = 3 + 3;\n}' });
    const html = renderToStaticMarkup(createElement(QuestionStatement, { statement }));
    expect(html.indexOf('Considere')).toBeLessThan(html.indexOf('<pre'));
    expect(html.indexOf('</pre>')).toBeLessThan(html.indexOf('A execução apresentará'));
    expect(html).not.toContain('```');
  });

  it('retains Python indentation, YAML content and multiple interleaved blocks', () => {
    const statement = 'Python:\n```python\ndef executar():\n    return 6\n```\nDepois, considere:\n```yaml\nservico:\n  replicas: 3\n```\nJulgue a afirmação.';
    const parts = parseQuestionStatement(statement);
    expect(parts.filter(part => part.kind === 'code').map(part => part.text)).toEqual(['def executar():\n    return 6', 'servico:\n  replicas: 3']);
    expect(parts.map(part => part.kind)).toEqual(['text', 'code', 'text', 'code', 'text']);
  });

  it('escapes HTML and script text instead of executing it', () => {
    const html = renderToStaticMarkup(createElement(QuestionStatement, { statement: '<script>alert(1)</script>\n```html\n<img src=x onerror=alert(2)>\n```\nO item termina aqui.' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });

  it('preserves incomplete fences as text without losing the end of a question', () => {
    const statement = 'Início\n```python\nprint(6)\nAfirmação final';
    expect(parseQuestionStatement(statement)).toEqual([{ kind: 'text', text: statement }]);
  });

  it('preserves legacy separate code and does not manufacture a language or key hint', () => {
    const html = renderToStaticMarkup(createElement(QuestionStatement, { statement: 'Julgue o item.', code: 'return 6;', language: 'Java' }));
    expect(html.indexOf('Julgue o item.')).toBeLessThan(html.indexOf('<pre'));
    expect(html).toContain('data-language="Java"');
    expect(html).not.toContain('Gabarito');
  });
});
