import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/errors';
import './index.css';
import { initTelemetry } from './lib/telemetry';

// Initialize GA4, Sentry, Web Vitals, and Consent Mode v2
initTelemetry();

// Focus-driven refetches are disabled app-wide: the Google One Tap / FedCM
// prompt loop churns window focus on the landing page, and each churn would
// refire every active query (auth/me, health, …) into the API throttler.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Last resort: a throw in the shell itself, above the per-route boundary. */}
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.update().catch(() => {});
    }
  });
}


