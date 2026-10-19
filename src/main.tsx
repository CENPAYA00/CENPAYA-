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

ReactDOM.createRoot(document.getElementById('root')!).render(
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
