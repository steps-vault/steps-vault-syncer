import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@stepsvault/sync-ui/sync-ui.css';
import './desktop-app.css';
import { DesktopApp } from './desktop-app';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <DesktopApp bridge={window.stepsVaultSync} />
    </StrictMode>,
  );
}
