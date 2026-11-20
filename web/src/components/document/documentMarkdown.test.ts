import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { documentExtensions, isAllowedLink } from './documentExtensions';

// Slice 5, decisions D4 and D10: what the rich editor keeps of a document's Markdown.

const editors: Editor[] = [];

function load(markdown: string): Editor {
  const editor = new Editor({
    extensions: documentExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
  editors.push(editor);
  return editor;
}

const roundTrip = (markdown: string) => load(markdown).getMarkdown().trimEnd();

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe('S5_FE_AC17: Markdown round trip', () => {
  it.each([
    ['headings', '# One\n\n## Two\n\n### Three'],
    ['inline formats', 'Some **bold**, *italic*, ~~struck~~ and `code`.'],
    ['links', 'See [the site](https://example.com) or [mail](mailto:ana@example.com).'],
    ['bullet lists', '- one\n- two'],
    ['numbered lists', '1. first\n2. second'],
    ['checklists', '- [ ] to do\n- [x] done'],
    ['blockquotes', '> quoted'],
    ['code blocks', '```js\nconst a = 1;\n```'],
    ['horizontal rules', 'above\n\n---\n\nbelow'],
  ])('S5_FE_AC17: %s survive the rich editor unchanged', (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('S5_FE_AC17: every format is drawn with its own element', () => {
    const html = load(
      '# T\n\n**b** *i* ~~s~~ `c` [l](https://x.dev)\n\n- u\n\n1. o\n\n- [x] t\n\n> q\n\n```\nk\n```\n\n---',
    ).getHTML();

    for (const tag of [
      '<h1>',
      '<strong>',
      '<em>',
      '<s>',
      '<code>',
      '<a ',
      '<ul>',
      '<ol>',
      'data-type="taskList"',
      '<blockquote>',
      '<pre>',
      '<hr>',
    ]) {
      expect(html).toContain(tag);
    }
  });

  it('S5_FE_AC17: raw HTML is never drawn as HTML', () => {
    const html = load(
      'Before\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
    ).getHTML();

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('S5_FE_AC17: a javascript: link is drawn without its address', () => {
    const html = load('[bad](javascript:alert(1))').getHTML();

    expect(html).not.toContain('javascript:');
  });
});

describe('S5_FE_AC17: allowed link addresses', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c',
    'mailto:ana@example.com',
    ' https://x.dev ',
  ])('S5_FE_AC17: %s is allowed', (url) => expect(isAllowedLink(url)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    '/relative',
    'example.com',
    'ftp://x',
    'https://',
    '',
  ])('S5_FE_AC17: "%s" is refused', (url) => expect(isAllowedLink(url)).toBe(false));
});
