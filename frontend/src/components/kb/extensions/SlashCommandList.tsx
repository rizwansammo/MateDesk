import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SlashItem {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  command: (args: { editor: any; range: any }) => void;
}

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const SlashCommandList = forwardRef((props: Props, ref) => {
  const [selected, setSelected] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [props.items]);

  useEffect(() => {
    const el = containerRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + props.items.length) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = props.items[selected];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <div
        className="text-[12px] text-[var(--text-3)] px-3 py-2 rounded-md shadow-xl"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)' }}
      >
        No matches
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-md shadow-xl overflow-y-auto custom-scrollbar"
      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-panel)', width: 280, maxHeight: 320 }}
    >
      {props.items.map((item, i) => (
        <button
          key={item.title}
          onMouseEnter={() => setSelected(i)}
          onClick={() => props.command(item)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left"
          style={{ background: i === selected ? 'var(--bg-surface)' : 'transparent' }}
        >
          <span className="flex items-center justify-center w-7 h-7 rounded flex-shrink-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}>
            {item.icon}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="text-[13px] text-[var(--text-1)] truncate">{item.title}</span>
            <span className="text-[11px] text-[var(--text-3)] truncate">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
export default SlashCommandList;
