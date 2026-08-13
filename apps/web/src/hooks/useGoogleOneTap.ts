import { useEffect, useRef } from 'react';
import { onIdle } from '../lib/idle';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

interface UseGoogleOneTapProps {
  clientId?: string | null;
  onSuccess: (credential: string) => void;
  onError?: () => void;
}

/**
 * Google One Tap, loaded late on purpose.
 *
 * `accounts.google.com/gsi/client` is ~97 KB transferred and ~84% unused on an
 * anonymous landing-page visit — the second-largest resource on the page, and a
 * third-party DNS + TLS handshake competing with the app's own assets during
 * the window LCP is measured over. Nobody needs it to *read* the page; it only
 * matters for a visitor about to sign in, and One Tap is a prompt that appears
 * over the page rather than part of it.
 *
 * So the script is injected once the browser is idle instead of on mount. The
 * prompt shows up a beat later than it used to; the page paints sooner. Sign-in
 * itself is unaffected — the Google and magic-link buttons in `SignInOptions`
 * are plain links and do not touch this SDK.
 */
export function useGoogleOneTap({ clientId: customClientId, onSuccess, onError }: UseGoogleOneTapProps) {
  const isInitialized = useRef(false);

  // Both callbacks are inline closures at every call site, so depending on them
  // directly would tear the effect down and re-run it on every render — which,
  // now that the script load is deferred, would cancel and reschedule the idle
  // callback each time and could keep it from ever firing.
  const handlers = useRef({ onSuccess, onError });
  handlers.current = { onSuccess, onError };

  useEffect(() => {
    // Only run on the client side
    if (typeof window === 'undefined') return;

    const clientId = customClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return;
    }

    const initOneTap = () => {
      if (isInitialized.current || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            handlers.current.onSuccess(response.credential);
          } else {
            handlers.current.onError?.();
          }
        },
        use_fedcm_for_prompt: true, // Use modern FedCM API if available
      });

      window.google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // You could handle prompt failure or skipping here
        }
      });

      isInitialized.current = true;
    };

    // If already loaded, initialize immediately
    if (window.google) {
      initOneTap();
      return;
    }

    let script: HTMLScriptElement | null = null;
    const cancel = onIdle(() => {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initOneTap;
      document.head.appendChild(script);
    });

    return () => {
      cancel();
      if (script && document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [customClientId]);
}
