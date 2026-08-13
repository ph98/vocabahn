/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  /**
   * Usersnap Space (global) API key for the product feedback widget. Unset is
   * a normal state: the trigger does not render and no script is fetched.
   */
  readonly VITE_USERSNAP_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

