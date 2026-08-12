import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchResult {
  from: number;
  to: number;
}

interface SearchStorage {
  searchTerm: string;
  caseSensitive: boolean;
  results: SearchResult[];
  currentIndex: number;
}

const searchKey = new PluginKey('searchReplace');

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Find all matches across the document. Matches are located per text node, so a
// term spanning multiple nodes (rare) is not matched — acceptable for v1.
function findMatches(doc: ProseMirrorNode, term: string, caseSensitive: boolean): SearchResult[] {
  const results: SearchResult[] = [];
  if (!term) return results;
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapeRegExp(term), flags);

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(node.text)) !== null) {
      const from = pos + match.index;
      results.push({ from, to: from + match[0].length });
      if (match.index === regex.lastIndex) regex.lastIndex++; // guard zero-width
    }
  });
  return results;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setSearchCaseSensitive: (value: boolean) => ReturnType;
      goToNextResult: () => ReturnType;
      goToPrevResult: () => ReturnType;
      replaceCurrent: (replaceWith: string) => ReturnType;
      replaceAll: (replaceWith: string) => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

export const SearchReplace = Extension.create<unknown, SearchStorage>({
  name: 'searchReplace',

  addStorage() {
    return { searchTerm: '', caseSensitive: false, results: [], currentIndex: 0 };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term) =>
        ({ tr, dispatch }) => {
          this.storage.searchTerm = term;
          this.storage.currentIndex = 0;
          if (dispatch) dispatch(tr.setMeta(searchKey, true));
          return true;
        },
      setSearchCaseSensitive:
        (value) =>
        ({ tr, dispatch }) => {
          this.storage.caseSensitive = value;
          this.storage.currentIndex = 0;
          if (dispatch) dispatch(tr.setMeta(searchKey, true));
          return true;
        },
      goToNextResult:
        () =>
        ({ tr, dispatch }) => {
          const { results, currentIndex } = this.storage;
          if (!results.length) return false;
          this.storage.currentIndex = (currentIndex + 1) % results.length;
          if (dispatch) dispatch(tr.setMeta(searchKey, true));
          return true;
        },
      goToPrevResult:
        () =>
        ({ tr, dispatch }) => {
          const { results, currentIndex } = this.storage;
          if (!results.length) return false;
          this.storage.currentIndex = (currentIndex - 1 + results.length) % results.length;
          if (dispatch) dispatch(tr.setMeta(searchKey, true));
          return true;
        },
      replaceCurrent:
        (replaceWith) =>
        ({ tr, dispatch }) => {
          const { results, currentIndex } = this.storage;
          const target = results[currentIndex];
          if (!target) return false;
          if (dispatch) {
            tr.insertText(replaceWith, target.from, target.to);
            tr.setMeta(searchKey, true);
            dispatch(tr);
          }
          return true;
        },
      replaceAll:
        (replaceWith) =>
        ({ tr, dispatch }) => {
          const results = [...this.storage.results];
          if (!results.length) return false;
          if (dispatch) {
            // Replace from last to first so earlier positions stay valid.
            for (let i = results.length - 1; i >= 0; i--) {
              tr.insertText(replaceWith, results[i].from, results[i].to);
            }
            tr.setMeta(searchKey, true);
            dispatch(tr);
          }
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.searchTerm = '';
          this.storage.results = [];
          this.storage.currentIndex = 0;
          if (dispatch) dispatch(tr.setMeta(searchKey, true));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: searchKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, old) {
            const meta = tr.getMeta(searchKey);
            if (!meta && !tr.docChanged) {
              return old.map(tr.mapping, tr.doc);
            }
            const matches = findMatches(tr.doc, storage.searchTerm, storage.caseSensitive);
            storage.results = matches;
            if (storage.currentIndex >= matches.length) storage.currentIndex = 0;
            const decorations = matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === storage.currentIndex ? 'kb-search-hit kb-search-hit-active' : 'kb-search-hit',
              })
            );
            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export default SearchReplace;
