import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installPickerHelper } from './pickers';

installPickerHelper();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keep the app itself on the phone so it opens with no signal (live site only).
// Tapping the morning debrief notification opens the debrief.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type === 'open-debrief') dispatchEvent(new Event('ld:open-debrief'));
  });
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline opening just won't be available */
    });
  });
}
