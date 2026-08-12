import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { apiFetch } from '@/lib/api';
import { createSuggestionRender } from './suggestion-popup';
import DocLinkList, { type DocItem } from './DocLinkList';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Type `@` in the editor to search KB documents and insert a link to one.
export const DocLinkSuggestion = Extension.create({
  name: 'docLinkSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<DocItem>({
        editor: this.editor,
        pluginKey: new PluginKey('docLinkSuggestion'),
        char: '@',
        allowSpaces: false,
        startOfLine: false,
        items: async ({ query }) => {
          try {
            const qs = query ? `?q=${encodeURIComponent(query)}` : '';
            const articles = await apiFetch<DocItem[]>(`/api/kb/articles/${qs}`);
            return (articles || []).slice(0, 8);
          } catch {
            return [];
          }
        },
        command: ({ editor, range, props }) => {
          const href = `/kb/documentation/${props.id}`;
          const label = escapeHtml(props.title || 'Untitled');
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(`<a href="${href}">${label}</a>&nbsp;`)
            .run();
        },
        render: createSuggestionRender(DocLinkList),
      }),
    ];
  },
});

export default DocLinkSuggestion;
