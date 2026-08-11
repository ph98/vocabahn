import { useEffect, useRef } from 'react';

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

export function useGoogleOneTap({ clientId: customClientId, onSuccess, onError }: UseGoogleOneTapProps) {
  const isInitialized = useRef(false);

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
            onSuccess(response.credential);
          } else {
            onError?.();
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
    } else {
      // Otherwise, load the script
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initOneTap;
      document.head.appendChild(script);

      return () => {
        if (document.head.contains(script)) {
          document.head.removeChild(script);
        }
      };
    }
  }, [onSuccess, onError]);
}
