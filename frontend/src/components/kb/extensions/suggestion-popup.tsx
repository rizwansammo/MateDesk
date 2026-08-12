import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';

// Builds a TipTap suggestion `render` object that mounts a React list component
// in a fixed-position popup near the caret, with arrow/enter keyboard handling.
// The list component must forwardRef and expose `onKeyDown({ event }) => boolean`.
export function createSuggestionRender(Component: any): SuggestionOptions['render'] {
  return () => {
    let renderer: ReactRenderer;
    let popup: HTMLDivElement | null = null;

    const position = (clientRect?: (() => DOMRect | null) | null) => {
      if (!popup || !clientRect) return;
      const rect = clientRect();
      if (!rect) return;
      const height = popup.offsetHeight;
      const below = rect.bottom + 6;
      popup.style.left = `${Math.round(rect.left)}px`;
      popup.style.top =
        below + height > window.innerHeight && rect.top - height - 6 > 0
          ? `${Math.round(rect.top - height - 6)}px`
          : `${Math.round(below)}px`;
    };

    const cleanup = () => {
      popup?.remove();
      popup = null;
      renderer?.destroy();
    };

    return {
      onStart: (props: any) => {
        renderer = new ReactRenderer(Component, { props, editor: props.editor });
        popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.zIndex = '9000';
        popup.appendChild(renderer.element);
        document.body.appendChild(popup);
        position(props.clientRect);
      },
      onUpdate: (props: any) => {
        renderer.updateProps(props);
        position(props.clientRect);
      },
      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          cleanup();
          return true;
        }
        return (renderer.ref as any)?.onKeyDown?.(props) ?? false;
      },
      onExit: cleanup,
    };
  };
}
