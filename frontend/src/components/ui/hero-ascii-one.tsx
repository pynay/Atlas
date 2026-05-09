'use client';

import { useEffect, useRef, useState } from 'react';

export default function AnimationPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Layout already loaded the script globally. If it's ready, reinit immediately.
    // Otherwise wait for it to finish loading (it fires UnicornStudio.init itself).
    const tryInit = () => {
      if (typeof window === 'undefined') return;
      const US = (window as unknown as { UnicornStudio?: { isInitialized?: boolean; init?: () => void; reinit?: () => void } }).UnicornStudio;
      if (US?.isInitialized && US.reinit) {
        US.reinit();
      } else if (US && !US.isInitialized && US.init) {
        US.init();
        US.isInitialized = true;
      }
      // Fade in once we've triggered init
      setTimeout(() => setVisible(true), 300);
    };

    // Give the layout script a moment if it hasn't resolved yet
    if ((window as unknown as { UnicornStudio?: { isInitialized?: boolean } }).UnicornStudio?.isInitialized) {
      tryInit();
    } else {
      const t = setTimeout(tryInit, 800);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const kill = (el: Element) => {
      (el as HTMLElement).style.cssText = 'display:none!important;opacity:0!important;pointer-events:none!important;';
      try { el.remove(); } catch (_) {}
    };

    const isWatermark = (el: Element) => {
      const text = (el.textContent || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      const src = (el.getAttribute('src') || '').toLowerCase();
      return (
        text.includes('unicorn') ||
        text.includes('made with') ||
        href.includes('unicorn') ||
        src.includes('unicorn')
      );
    };

    // Sweep the whole document — watermark lives outside [data-us-project]
    const sweep = () => {
      document.querySelectorAll('a, button, [class*="watermark"], [class*="brand"], [class*="badge"]').forEach(el => {
        if (isWatermark(el)) kill(el);
      });
    };

    sweep();

    // MutationObserver catches it the instant it's injected
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node instanceof Element) {
            if (isWatermark(node)) { kill(node); return; }
            node.querySelectorAll('*').forEach(child => { if (isWatermark(child)) kill(child); });
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    const id = setInterval(sweep, 500);
    setTimeout(() => clearInterval(id), 15000);

    return () => { observer.disconnect(); clearInterval(id); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full hidden lg:block transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        data-us-project="OMzqyUv6M3kSnv0JeAtC"
        style={{ width: '100%', height: '100%', minHeight: '100vh' }}
        suppressHydrationWarning
      />
    </div>
  );
}
