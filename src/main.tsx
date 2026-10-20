import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './contexts/theme';
import { I18nProvider } from './contexts/i18n';
import { SoundProvider } from './contexts/sound';
import { LightGuard } from './components/LightGuard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 1. Import the notification system
import { installNotify, NotifyHost } from './lib/notify';

// 2. Activate the global override (kills the browser alert)
installNotify();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[CenPaya] Mount failed: #root element not found in index.html');
  const errEl = document.createElement('div');
  errEl.style.cssText = 'padding:24px;color:#c2362b;font-family:system-ui,sans-serif;text-align:center';
  errEl.textContent = 'CenPaya failed to mount: missing #root element.';
  document.body?.appendChild(errEl);
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <LightGuard>
          <ThemeProvider>
            <I18nProvider>
              <SoundProvider>
                {/* 3. Render the popup host */}
                <NotifyHost />
                <App />
              </SoundProvider>
            </I18nProvider>
          </ThemeProvider>
        </LightGuard>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
