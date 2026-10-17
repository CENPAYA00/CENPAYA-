import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './contexts/theme';
import { I18nProvider } from './contexts/i18n';
import { SoundProvider } from './contexts/sound';
import { LightGuard } from './components/LightGuard'; // ADDED

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LightGuard> {/* ADDED */}
      <ThemeProvider>
        <I18nProvider>
          <SoundProvider>
            <App />
          </SoundProvider>
        </I18nProvider>
      </ThemeProvider>
    </LightGuard> {/* ADDED */}
  </React.StrictMode>,
);
