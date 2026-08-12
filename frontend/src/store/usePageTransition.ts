import { create } from 'zustand';

type TransitionColor = 'blue' | 'green';

interface PageTransitionStore {
  active:         boolean;
  color:          TransitionColor;
  dismissPending: boolean;
  trigger:  (navigate: () => void, color?: TransitionColor) => void;
  dismiss:  () => void;
}

export const usePageTransition = create<PageTransitionStore>((set) => ({
  active:         false,
  color:          'blue',
  dismissPending: false,
  trigger: (navigate, color = 'blue') => {
    set({ active: true, color, dismissPending: false });
    setTimeout(() => {
      navigate();
      // Signal that we're waiting for the new route to commit.
      // The overlay will not dismiss until usePathname() reflects the
      // new path (meaning the new page DOM is committed and ready).
      set({ dismissPending: true });
    }, 220);
  },
  dismiss: () => set({ active: false, dismissPending: false }),
}));
