import {loadClaimConfigs} from './lib/claimConfig';
import './lib/installPrompt';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initI18n } from './lib/i18n';
import './index.css';
import './styles/operator-dark.css';

// Die Texte der eigenen Sprache laden, bevor etwas gezeichnet wird (Deutsch ist sofort da).
void Promise.allSettled([initI18n(),loadClaimConfigs()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
