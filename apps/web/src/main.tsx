import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/errors';
import { installSessionQueryDefaults } from './hooks/useSession';
import './index.css';
import { consumeNotificationSource } from './lib/push';
import { initTelemetry, trackEvent } from './lib/telemetry';

// Initialize GA4, Sentry, Web Vitals, and Consent Mode v2
initTelemetry();

// A session that began at a tapped notification carries a marker the service
// worker put in the URL. Read it before the router does, so the address bar is
// already clean by the time anything renders.
const notificationSource = consumeNotificationSource();
if (notificationSource) {
  trackEvent('notification_click', { notification_type: notificationSource });
}

// Focus-driven refetches are disabled app-wide: the Google One Tap / FedCM
// prompt loop churns window focus on the landing page, and each churn would
// refire every active query (auth/me, health, …) into the API throttler.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

// Bounded exponential backoff for `['me']`, and no retry at all against a 4xx.
// This is what keeps a failing session check off the throttler now that
// `fetchMe` reports failures instead of swallowing them as "signed out".
installSessionQueryDefaults(queryClient);

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


