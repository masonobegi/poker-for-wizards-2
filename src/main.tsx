import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './components/card/card.css';
import './vfx/effects.css';

// Uncaught errors in the page go to the same crash.log the shell writes, in
// the user data folder, so a player whose game misbehaved has one file to send.
// No-ops in a browser, where there is no shell to write it.
{
  const shell = (window as unknown as { hexhold?: { reportCrash?: (d: string) => Promise<string> } }).hexhold;
  if (shell?.reportCrash) {
    let sent = 0;
    const report = (detail: string) => {
      if (sent >= 20) return; // a render loop that throws every frame must not fill the disk
      sent += 1;
      void shell.reportCrash?.(detail).catch(() => {});
    };
    window.addEventListener('error', (e) => {
      report(`error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}
${e.error?.stack ?? ''}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as { stack?: string } | undefined;
      report(`unhandled rejection: ${r?.stack ?? String(e.reason)}`);
    });
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Drop the pre-React splash once the first frame has actually painted.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.style.opacity = '0';
    window.setTimeout(() => boot.remove(), 600);
  });
});
