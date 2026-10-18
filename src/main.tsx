import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './contexts/theme';
import { I18nProvider } from './contexts/i18n';
import { SoundProvider } from './contexts/sound';
import { LightGuard } from './components/LightGuard';
// ADDED: React Query setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is considered fresh for 5 minutes
      refetchOnWindowFocus: false, // Don't refetch every time they switch apps
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}> {/* ADDED */}
      <LightGuard>
        <ThemeProvider>
          <I18nProvider>
            <SoundProvider>
              <App />
            </SoundProvider>
          </I18nProvider>
        </ThemeProvider>
      </LightGuard>
    </QueryClientProvider> {/* ADDED */}
  </React.StrictMode>,
);
