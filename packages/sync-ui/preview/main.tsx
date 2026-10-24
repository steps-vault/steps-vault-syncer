import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewApp } from './preview-app';

const rootElement = document.getElementById('preview-root');
if (!rootElement) throw new Error('The preview page has no #preview-root element. Check index.html.');
createRoot(rootElement).render(<StrictMode><PreviewApp /></StrictMode>);
