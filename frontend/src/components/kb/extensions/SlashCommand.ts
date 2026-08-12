import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { createElement } from 'react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Code, Table as TableIcon,
  Quote, Minus, Info, Image as ImageIcon,
} from 'lucide-react';
import { createSuggestionRender } from './suggestion-popup';
import SlashCommandList, { type SlashItem } from './SlashCommandList';

const icon = (C: any) => createElement(C, { size: 15 });

function chain(editor: any, range: any) {
  return editor.chain().focus().deleteRange(range);
}

// `onPickImage` is supplied by the editor component (opens a file picker → base64 insert).
export function buildSlashItems(onPickImage: () => void): SlashItem[] {
  return [
    { title: 'Heading 1', subtitle: 'Large section heading', icon: icon(Heading1), command: ({ editor, range }) => chain(editor, range).toggleHeading({ level: 1 }).run() },
    { title: 'Heading 2', subtitle: 'Medium section heading', icon: icon(Heading2), command: ({ editor, range }) => chain(editor, range).toggleHeading({ level: 2 }).run() },
    { title: 'Heading 3', subtitle: 'Small section heading', icon: icon(Heading3), command: ({ editor, range }) => chain(editor, range).toggleHeading({ level: 3 }).run() },
    { title: 'Bullet List', subtitle: 'Unordered list', icon: icon(List), command: ({ editor, range }) => chain(editor, range).toggleBulletList().run() },
    { title: 'Numbered List', subtitle: 'Ordered list', icon: icon(ListOrdered), command: ({ editor, range }) => chain(editor, range).toggleOrderedList().run() },
    { title: 'Task List', subtitle: 'Checklist with checkboxes', icon: icon(CheckSquare), command: ({ editor, range }) => chain(editor, range).toggleTaskList().run() },
    { title: 'Code Block', subtitle: 'Syntax-highlighted code', icon: icon(Code), command: ({ editor, range }) => chain(editor, range).toggleCodeBlock().run() },
    { title: 'Table', subtitle: '3×3 table with header', icon: icon(TableIcon), command: ({ editor, range }) => chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: 'Quote', subtitle: 'Block quote', icon: icon(Quote), command: ({ editor, range }) => chain(editor, range).toggleBlockquote().run() },
    { title: 'Divider', subtitle: 'Horizontal rule', icon: icon(Minus), command: ({ editor, range }) => chain(editor, range).setHorizontalRule().run() },
    { title: 'Callout: Info', subtitle: 'Blue info panel', icon: icon(Info), command: ({ editor, range }) => chain(editor, range).setCallout('info').run() },
    { title: 'Callout: Tip', subtitle: 'Green tip panel', icon: icon(Info), command: ({ editor, range }) => chain(editor, range).setCallout('tip').run() },
    { title: 'Callout: Warning', subtitle: 'Amber warning panel', icon: icon(Info), command: ({ editor, range }) => chain(editor, range).setCallout('warning').run() },
    { title: 'Callout: Danger', subtitle: 'Red danger panel', icon: icon(Info), command: ({ editor, range }) => chain(editor, range).setCallout('danger').run() },
    { title: 'Image', subtitle: 'Upload from your computer', icon: icon(ImageIcon), command: ({ editor, range }) => { chain(editor, range).run(); onPickImage(); } },
  ];
}

export interface SlashCommandOptions {
  onPickImage: () => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { onPickImage: () => {} };
  },

  addProseMirrorPlugins() {
    const onPickImage = this.options.onPickImage;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => props.command({ editor, range }),
        items: ({ query }) => {
          const all = buildSlashItems(onPickImage);
          const q = query.toLowerCase();
          return q ? all.filter((i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)) : all;
        },
        render: createSuggestionRender(SlashCommandList),
      }),
    ];
  },
});

export default SlashCommand;
