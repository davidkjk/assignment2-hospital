import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './widget/widget.css';

const root = document.getElementById('webchat-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
