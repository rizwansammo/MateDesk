import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import powershell from 'highlight.js/lib/languages/powershell';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Superscript as SuperscriptIcon, Subscript as SubscriptIcon, Code, Image as ImageIcon, Table as TableIcon, List, ListOrdered, CheckSquare, Heading1, Heading2, Heading3, Link as LinkIcon, Youtube as YoutubeIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Highlighter, Type, Search, X as XIcon, ChevronUp, ChevronDown, Info } from 'lucide-react';
import { Callout } from './extensions/Callout';
import { SearchReplace } from './extensions/SearchReplace';
import { SlashCommand } from './extensions/SlashCommand';
import { DocLinkSuggestion } from './extensions/DocLinkSuggestion';

const lowlight = createLowlight(common);
lowlight.register('powershell', powershell);
lowlight.register('ps', powershell);
import { Underline } from '@tiptap/extension-underline';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Link } from '@tiptap/extension-link';
import { Youtube } from '@tiptap/extension-youtube';
import { FontFamily } from '@tiptap/extension-font-family';
import { useCallback, useEffect, useState, useRef } from 'react';

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
      },
    };
  },
});

export default function TipTapEditor({ content, onChange, readOnly = false }: any) {
  const editorRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Insert an image file as an inline base64 data URL (no server round-trip).
  const insertImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Image is larger than 5 MB — please use a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      if (src) editorRef.current?.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Callout,
      SearchReplace,
      SlashCommand.configure({ onPickImage: () => fileInputRef.current?.click() }),
      DocLinkSuggestion,
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Youtube.configure({ inline: false }),
      FontFamily,
      FontSize,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastUpdatedContent.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none text-[14px] leading-relaxed text-[var(--text-1)]',
      },
      handlePaste: (_view: any, event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) { insertImageFile(file); return true; }
          }
        }
        return false;
      },
      handleDrop: (_view: any, event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (files && files.length && files[0].type.startsWith('image/')) {
          insertImageFile(files[0]);
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  editorRef.current = editor;

  const lastUpdatedContent = useRef(content);

  // Re-sync content if it changes externally (e.g., initial load or different document).
  // Never while the editor has focus — resetting mid-typing wipes keystrokes and
  // jumps the cursor.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (content !== editor.getHTML() && content !== lastUpdatedContent.current) {
      editor.commands.setContent(content, { emitUpdate: false });
      lastUpdatedContent.current = content;
    }
  }, [content, editor]);

  // Sync readOnly mode dynamically
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  const [imageUrlPrompt, setImageUrlPrompt] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  // ── Find & Replace ──────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refreshSearchMeta = useCallback(() => {
    if (!editor) return;
    const s = (editor.storage as any).searchReplace as { results: unknown[]; currentIndex: number };
    setMatchCount(s.results.length);
    setCurrentMatch(s.results.length ? s.currentIndex + 1 : 0);
  }, [editor]);

  const scrollToActiveHit = useCallback(() => {
    setTimeout(() => {
      document.querySelector('.kb-search-hit-active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }, []);

  // Ctrl/Cmd+F opens the in-document find bar; Escape closes it.
  useEffect(() => {
    if (!editor || readOnly) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const active = document.activeElement;
        const inEditor = editor.isFocused || active === searchInputRef.current;
        if (inEditor) {
          e.preventDefault();
          setFindOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      } else if (e.key === 'Escape' && findOpen) {
        setFindOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor, readOnly, findOpen]);

  // Push the search term into the editor plugin as it changes.
  useEffect(() => {
    if (!editor || !findOpen) return;
    editor.commands.setSearchTerm(findTerm);
    refreshSearchMeta();
    scrollToActiveHit();
  }, [editor, findTerm, findOpen, refreshSearchMeta, scrollToActiveHit]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setSearchCaseSensitive(caseSensitive);
    refreshSearchMeta();
  }, [editor, caseSensitive, refreshSearchMeta]);

  // Clear highlights when the bar closes.
  useEffect(() => {
    if (!editor) return;
    if (!findOpen) {
      editor.commands.clearSearch();
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }, [editor, findOpen]);

  if (!editor) return null;

  const doNext = () => { editor.commands.goToNextResult(); refreshSearchMeta(); scrollToActiveHit(); };
  const doPrev = () => { editor.commands.goToPrevResult(); refreshSearchMeta(); scrollToActiveHit(); };
  const doReplace = () => { editor.commands.replaceCurrent(replaceTerm); refreshSearchMeta(); scrollToActiveHit(); };
  const doReplaceAll = () => { editor.commands.replaceAll(replaceTerm); refreshSearchMeta(); };

  const handleAddImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (imageUrl.trim()) {
      editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    }
    setImageUrlPrompt(false);
    setImageUrl('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <style>{`
        .kb-search-hit { background: rgba(250,204,21,0.35); border-radius: 2px; }
        .kb-search-hit-active { background: rgba(249,115,22,0.75); color: #fff; }
        .ProseMirror pre { background:#0d1117; color:#e6edf3; padding:12px 14px; border-radius:6px; overflow-x:auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; line-height:1.5; }
        .ProseMirror pre code { background:none; color:inherit; padding:0; font-size:inherit; }
        .hljs-comment,.hljs-quote{color:#7f848e;font-style:italic}
        .hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag{color:#c678dd}
        .hljs-string,.hljs-attr,.hljs-template-tag,.hljs-addition,.hljs-meta-string{color:#98c379}
        .hljs-number,.hljs-literal,.hljs-type,.hljs-params,.hljs-meta,.hljs-link{color:#d19a66}
        .hljs-title,.hljs-class .hljs-title,.hljs-function .hljs-title{color:#61afef}
        .hljs-attribute,.hljs-variable,.hljs-template-variable{color:#e06c75}
        .hljs-symbol,.hljs-bullet,.hljs-subst,.hljs-section,.hljs-selector-id,.hljs-selector-class{color:#56b6c2}
        .hljs-deletion{color:#e06c75}
        .hljs-emphasis{font-style:italic}
        .hljs-strong{font-weight:700}
      `}</style>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImageFile(file);
          e.target.value = '';
        }}
      />
      {imageUrlPrompt && (
        <>
          <div 
            onClick={() => setImageUrlPrompt(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 8900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} 
          />
          <div style={{
            position: 'fixed', zIndex: 8901, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 360, background: 'var(--bg-deep)', border: '1px solid var(--border-panel)',
            borderTop: '2px solid #3b82f6', borderRadius: 0, boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-1)' }}>
              Insert Image
            </div>
            <form onSubmit={handleAddImage} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input 
                autoFocus
                className="input"
                placeholder="Image URL..."
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setImageUrlPrompt(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Insert</button>
              </div>
            </form>
          </div>
        </>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex-shrink-0">
          <select 
            className="select text-[12px] py-1 px-2 h-7 min-h-0 bg-[var(--bg-surface)] border-[var(--border-subtle)]"
            onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
            defaultValue=""
          >
            <option value="">Default Font</option>
            <option value="Inter">Inter</option>
            <option value="Roboto">Roboto</option>
            <option value="JetBrains Mono">JetBrains Mono</option>
            <option value="IBM Plex Sans">IBM Plex Sans</option>
          </select>

          <select 
            className="select text-[12px] py-1 px-2 h-7 min-h-0 bg-[var(--bg-surface)] border-[var(--border-subtle)]"
            onChange={e => e.target.value ? editor.chain().focus().setFontSize(e.target.value).run() : editor.chain().focus().unsetFontSize().run()}
            defaultValue=""
          >
            <option value="">Size</option>
            <option value="10px">10px</option>
            <option value="12px">12px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
            <option value="18px">18px</option>
            <option value="20px">20px</option>
            <option value="24px">24px</option>
            <option value="30px">30px</option>
          </select>

          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

          <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded ${editor.isActive('bold') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Bold size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded ${editor.isActive('italic') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Italic size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded ${editor.isActive('underline') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><UnderlineIcon size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-1.5 rounded ${editor.isActive('strike') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Strikethrough size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleSuperscript().run()} className={`p-1.5 rounded ${editor.isActive('superscript') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><SuperscriptIcon size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleSubscript().run()} className={`p-1.5 rounded ${editor.isActive('subscript') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><SubscriptIcon size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleCode().run()} className={`p-1.5 rounded ${editor.isActive('code') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Code size={15}/></button>
          
          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />
          
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-1.5 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Heading1 size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Heading2 size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-1.5 rounded ${editor.isActive('heading', { level: 3 }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Heading3 size={15}/></button>

          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />
          
          <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`p-1.5 rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><AlignLeft size={15}/></button>
          <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`p-1.5 rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><AlignCenter size={15}/></button>
          <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`p-1.5 rounded ${editor.isActive({ textAlign: 'right' }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><AlignRight size={15}/></button>
          <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`p-1.5 rounded ${editor.isActive({ textAlign: 'justify' }) ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><AlignJustify size={15}/></button>

          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />
          
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded ${editor.isActive('bulletList') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><List size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded ${editor.isActive('orderedList') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><ListOrdered size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`p-1.5 rounded ${editor.isActive('taskList') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><CheckSquare size={15}/></button>
          <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`p-1.5 rounded ${editor.isActive('codeBlock') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Code size={15}/></button>
          {editor.isActive('codeBlock') && (
            <select
              className="select text-[12px] py-1 px-2 h-7 min-h-0 bg-[var(--bg-surface)] border-[var(--border-subtle)]"
              value={editor.getAttributes('codeBlock').language || ''}
              onChange={e => editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value }).run()}
              title="Code language"
            >
              <option value="">Plain</option>
              <option value="powershell">PowerShell</option>
              <option value="bash">Bash / Shell</option>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
              <option value="sql">SQL</option>
              <option value="xml">HTML / XML</option>
              <option value="css">CSS</option>
              <option value="ini">INI / TOML</option>
            </select>
          )}

          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

          <button onClick={() => {
            const url = window.prompt('URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }} className={`p-1.5 rounded ${editor.isActive('link') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><LinkIcon size={15}/></button>
          <button onClick={() => setImageUrlPrompt(true)} className="p-1.5 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]"><ImageIcon size={15}/></button>
          <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="p-1.5 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]"><TableIcon size={15}/></button>
          <button onClick={() => {
            const url = window.prompt('YouTube URL');
            if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
          }} className="p-1.5 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]"><YoutubeIcon size={15}/></button>

          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

          <select
            className="select text-[12px] py-1 px-2 h-7 min-h-0 bg-[var(--bg-surface)] border-[var(--border-subtle)]"
            value={editor.isActive('callout') ? (editor.getAttributes('callout').type || 'info') : ''}
            onChange={e => {
              const v = e.target.value;
              if (!v) editor.chain().focus().unsetCallout().run();
              else editor.chain().focus().setCallout(v as any).run();
            }}
            title="Callout box"
          >
            <option value="">Callout</option>
            <option value="info">ℹ Info</option>
            <option value="tip">✓ Tip</option>
            <option value="warning">⚠ Warning</option>
            <option value="danger">⛔ Danger</option>
          </select>

          <button onClick={() => { setFindOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }} title="Find & replace (Ctrl+F)" className="p-1.5 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]"><Search size={15}/></button>
        </div>
      )}

      {findOpen && !readOnly && (
        <div
          className="absolute top-2 right-2 z-30 flex flex-col gap-1.5 p-2 rounded-md shadow-xl"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', width: 320 }}
        >
          <div className="flex items-center gap-1.5">
            <Search size={14} className="text-[var(--text-3)] flex-shrink-0" />
            <input
              ref={searchInputRef}
              value={findTerm}
              onChange={e => setFindTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? doPrev() : doNext(); } }}
              placeholder="Find"
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[12px] text-[var(--text-1)] outline-none"
            />
            <span className="text-[11px] text-[var(--text-3)] tabular-nums whitespace-nowrap min-w-[40px] text-center">
              {matchCount ? `${currentMatch}/${matchCount}` : '0/0'}
            </span>
            <button onClick={doPrev} disabled={!matchCount} title="Previous (Shift+Enter)" className="p-1 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] disabled:opacity-40"><ChevronUp size={14}/></button>
            <button onClick={doNext} disabled={!matchCount} title="Next (Enter)" className="p-1 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)] disabled:opacity-40"><ChevronDown size={14}/></button>
            <button onClick={() => setFindOpen(false)} title="Close (Esc)" className="p-1 rounded text-[var(--text-2)] hover:bg-[var(--bg-surface)]"><XIcon size={14}/></button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-[14px] flex-shrink-0" />
            <input
              value={replaceTerm}
              onChange={e => setReplaceTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doReplace(); } }}
              placeholder="Replace with"
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[12px] text-[var(--text-1)] outline-none"
            />
            <button onClick={doReplace} disabled={!matchCount} className="px-2 py-1 rounded text-[11px] text-[var(--text-2)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] disabled:opacity-40 whitespace-nowrap">Replace</button>
            <button onClick={doReplaceAll} disabled={!matchCount} className="px-2 py-1 rounded text-[11px] text-[var(--text-2)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] disabled:opacity-40 whitespace-nowrap">All</button>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] pl-[20px] cursor-pointer select-none">
            <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
            Match case
          </label>
        </div>
      )}

      {!readOnly && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor, from, to }) =>
            from !== to && !editor.isActive('image') && !editor.isActive('codeBlock')
          }
        >
          <div
            className="flex items-center gap-0.5 p-1 rounded-md shadow-lg"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}
          >
            <button onClick={() => editor.chain().focus().toggleBold().run()} title="Bold" className={`p-1.5 rounded ${editor.isActive('bold') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Bold size={15}/></button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic" className={`p-1.5 rounded ${editor.isActive('italic') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Italic size={15}/></button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" className={`p-1.5 rounded ${editor.isActive('underline') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><UnderlineIcon size={15}/></button>
            <button onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough" className={`p-1.5 rounded ${editor.isActive('strike') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Strikethrough size={15}/></button>
            <button onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight" className={`p-1.5 rounded ${editor.isActive('highlight') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Highlighter size={15}/></button>
            <button onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code" className={`p-1.5 rounded ${editor.isActive('code') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}><Code size={15}/></button>
            <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-0.5" />
            <button
              onClick={() => {
                if (editor.isActive('link')) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  const url = window.prompt('URL');
                  if (url) editor.chain().focus().setLink({ href: url }).run();
                }
              }}
              title={editor.isActive('link') ? 'Remove link' : 'Add link'}
              className={`p-1.5 rounded ${editor.isActive('link') ? 'bg-[var(--bg-surface)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-1)]'}`}
            ><LinkIcon size={15}/></button>
          </div>
        </BubbleMenu>
      )}

      <div className="flex-1 overflow-y-auto px-10 py-8 relative custom-scrollbar bg-[var(--bg-deep)]">
        <EditorContent editor={editor} className="min-h-full text-[var(--text-1)]" />
      </div>
    </div>
  );
}
