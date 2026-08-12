import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutType = 'info' | 'tip' | 'warning' | 'danger';

const CALLOUT_STYLES: Record<CalloutType, { border: string; bg: string }> = {
  info:    { border: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
  tip:     { border: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
  warning: { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  danger:  { border: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
};

function styleFor(type: CalloutType): string {
  const c = CALLOUT_STYLES[type] || CALLOUT_STYLES.info;
  return [
    `border-left:3px solid ${c.border}`,
    `background:${c.bg}`,
    'padding:12px 16px',
    'border-radius:4px',
    'margin:12px 0',
  ].join(';');
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type: CalloutType) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

// Block container that visually groups content as an info/tip/warning/danger panel.
// Styling is rendered inline so the saved HTML carries its own appearance everywhere.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-type') || 'info',
        renderHTML: (attributes) => ({ 'data-type': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = (node.attrs.type as CalloutType) || 'info';
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': '', style: styleFor(type) }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

export default Callout;
