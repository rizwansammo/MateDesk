'use client';

import { useEffect } from 'react';

// Fades out and removes the pre-hydration #app-splash div.
// Waits for fonts to be ready + a minimum display time so the animation
// always completes at least one full rotation before disappearing.
export function SplashDismiss() {
  useEffect(() => {
    const el = document.getElementById('app-splash');
    if (!el) return;

    const minWait   = new Promise<void>(r => setTimeout(r, 700));
    const fontsReady = typeof document !== 'undefined' && document.fonts
      ? document.fonts.ready.then(() => undefined)
      : Promise.resolve();

    Promise.all([minWait, fontsReady]).then(() => {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      const onDone = () => { el.style.display = 'none'; };
      el.addEventListener('transitionend', onDone, { once: true });
      // Safety fallback in case transitionend doesn't fire
      setTimeout(onDone, 500);
    });
  }, []);

  return null;
}
