import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Apply a saved theme before the first paint.
try {
  const t = JSON.parse(localStorage.getItem('hpl-theme') || '"system"');
  if (t === 'dark' || t === 'light') document.documentElement.classList.add(t);
} catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
