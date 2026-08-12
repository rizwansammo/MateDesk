import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

export interface DocItem {
  id: string;
  title: string;
  document_type?: string;
}

interface Props {
  items: DocItem[];
  command: (item: DocItem) => void;
}

const DocLinkList = forwardRef((props: Props, ref) => {
  const [selected, setSelected] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [props.items]);

  useEffect(() => {
    const el = containerRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowDown') { setSelected((s) => (s + 1) % Math.max(props.items.length, 1)); return true; }
      if (event.key === 'ArrowUp') { setSelected((s) => (s - 1 + props.items.length) % Math.max(props.items.length, 1)); return true; }
      if (event.key === 'Enter') { const item = props.items[selected]; if (item) props.command(item); return true; }
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <div className="text-[12px] text-[var(--text-3)] px-3 py-2 rounded-md shadow-xl" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}>
        No documents found
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-md shadow-xl overflow-y-auto custom-scrollbar"
      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', width: 300, maxHeight: 300 }}
    >
      {props.items.map((item, i) => (
        <button
          key={item.id}
          onMouseEnter={() => setSelected(i)}
          onClick={() => props.command(item)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left"
          style={{ background: i === selected ? 'var(--bg-surface)' : 'transparent' }}
        >
          <FileText size={14} className="flex-shrink-0" style={{ color: '#a78bfa' }} />
          <span className="flex flex-col min-w-0">
            <span className="text-[13px] text-[var(--text-1)] truncate">{item.title || 'Untitled'}</span>
            {item.document_type && <span className="text-[11px] text-[var(--text-3)] truncate">{item.document_type}</span>}
          </span>
        </button>
      ))}
    </div>
  );
});

DocLinkList.displayName = 'DocLinkList';
export default DocLinkList;
