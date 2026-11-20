---
id: 0014
titulo: TipTap with its Markdown extension as the document editor
status: aceptado
fecha: 2026-11-19
aprobado_por: usuario (slice 5 plan)
---

## Context

Slice 5 adds document nodes whose body is Markdown, edited either as raw text or as rich text with
a toolbar and Markdown typing shortcuts. The rich editor must read and write Markdown, cover
headings, inline formats, three kinds of lists, quotes, code blocks, links and rules, never render
raw HTML, and not weigh on the map for users who never open a document.

Candidates: TipTap (ProseMirror), Milkdown (ProseMirror, Markdown-first) and MDXEditor (Lexical).

## Decision

TipTap v3: `@tiptap/react`, `@tiptap/starter-kit` (underline disabled), `@tiptap/extension-list`
for checklists and the official `@tiptap/markdown` for parsing and serializing. The rich editor
lives in `RichDocumentEditor.tsx` and is loaded with `React.lazy`; the rest of the document editor
imports only `documentLimits.ts`, so TipTap stays out of the map bundle. The stored format is
always Markdown; ProseMirror's document is never persisted.

## Consequences

- TipTap is the most maintained of the three and its StarterKit matches the slice's formats; its
  input rules give the Markdown typing shortcuts for free.
- Saving from rich mode can reformat the Markdown (list markers, spacing) and drops what the schema
  does not know, such as raw HTML. Opening a document never rewrites it: the editor reports the
  loaded text until the content really changes.
- The lazy chunk is about 477 kB (151 kB gzip), paid the first time a document opens in rich mode.
- jsdom cannot type into a contenteditable reliably: tests drive the rich editor through TipTap's
  commands (`element.editor`), and its typing shortcuts are left to manual validation.
