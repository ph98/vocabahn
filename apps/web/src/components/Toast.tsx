import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

/**
 * App-wide toast primitive.
 *
 * Deliberately small: one message, one optional description, one optional
 * action button. It is not a notification framework — anything richer belongs
 * in the feature that needs it, not here.
 *
 * Geometry is owned by CSS custom properties declared in `index.css`
 * (`--vb-toast-inset-bottom`, `--vb-toast-max-width`, `--vb-toast-z`) and
 * re-exported as {@link TOAST_REGION} so other floating UI can sit clear of the
 * toast region without hardcoding the same numbers.
 */

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  /** Button label. One or two words — "Undo", "Retry". */
  label: string;
  /** Runs after the toast is dismissed, so the toast never outlives its action. */
  onClick: () => void;
}

export interface ToastOptions {
  /**
   * Dedupe key. Firing again with the same id replaces the live toast in place
   * and restarts its timer instead of stacking a second copy — which is what
   * makes rapid toggling of one control produce one toast, not N.
   * Defaults to a fresh unique id, i.e. every call stacks.
   */
  id?: string;
  variant?: ToastVariant;
  /** Optional second line, for detail that does not fit the message. */
  description?: string;
  /** Auto-dismiss delay in ms. `0` keeps the toast until it is dismissed. */
  duration?: number;
  /** One optional action button. */
  action?: ToastAction;
}

interface ToastRecord {
  id: string;
  message: string;
  variant: ToastVariant;
  description?: string;
  duration: number;
  action?: ToastAction;
}

export interface ToastApi {
  /** Shows a toast and returns its id, which `dismiss` accepts. */
  show: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  error: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  info: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  /** No-op if the toast is already gone. */
  dismiss: (id: string) => void;
}

/**
 * The CSS custom properties that place the toast region. Other floating UI
 * (a feedback button, an offline banner) should anchor itself against these
 * rather than re-deriving the mobile-nav height.
 */
export const TOAST_REGION = {
  /** Distance from the viewport bottom to the toast region's bottom edge. Clears the mobile nav. */
  insetBottom: 'var(--vb-toast-inset-bottom)',
  /** Widest a toast gets; the region is centred within the viewport. */
  maxWidth: 'var(--vb-toast-max-width)',
  /** Stacking context of the region — above the nav (z-50). */
  zIndex: 'var(--vb-toast-z)',
} as const;

export const TOAST_DEFAULT_DURATION = 3000;

/** Beyond this the oldest toast is dropped rather than filling the screen. */
const MAX_VISIBLE = 3;

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Returns the stable toast API. The returned object keeps its identity for the
 * lifetime of the provider, so it is safe in `useEffect`/`useCallback` deps.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used inside a <ToastProvider>. It is mounted in App.tsx.');
  }
  return api;
}

const VARIANT_ICON: Record<ToastVariant, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  success: 'text-accent-emerald',
  error: 'text-accent-red',
  info: 'text-accent-indigo',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  // Nesting a provider inside another would mount a second toast region, and
  // two landmarks named "Notifications" is an accessibility defect, not a
  // feature. A nested provider defers to its ancestor instead. (Test helpers
  // wrap in a provider without knowing whether the tree already has one.)
  const inherited = useContext(ToastContext);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      seq.current += 1;
      const id = options.id ?? `vb-toast-${seq.current}`;
      const record: ToastRecord = {
        id,
        message,
        variant: options.variant ?? 'info',
        description: options.description,
        duration: options.duration ?? TOAST_DEFAULT_DURATION,
        action: options.action,
      };

      setToasts((prev) => {
        const at = prev.findIndex((t) => t.id === id);
        if (at !== -1) {
          // Replace in place so a re-fired toast does not jump to the bottom of
          // the stack while the user is reading it.
          const next = prev.slice();
          next[at] = record;
          return next;
        }
        return [...prev, record].slice(-MAX_VISIBLE);
      });

      // Timers are managed outside the state updater: React invokes updaters
      // twice under StrictMode, and a doubled setTimeout would leak.
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.delete(id);
      if (record.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), record.duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, options) => show(message, { ...options, variant: 'success' }),
      error: (message, options) => show(message, { ...options, variant: 'error' }),
      info: (message, options) => show(message, { ...options, variant: 'info' }),
      dismiss,
    }),
    [show, dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  if (inherited) return <>{children}</>;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Always mounted, even with nothing to show: a live region has to exist before
 * content is inserted into it, or assistive tech has nothing to observe.
 */
function ToastRegion({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: string) => void }) {
  return (
    <div className="vb-toast-region" role="region" aria-label="Notifications">
      <div role="status" aria-live="polite" aria-atomic="false">
        <ol className="vb-toast-list">
          {toasts.map((toast) => {
            const Icon = VARIANT_ICON[toast.variant];
            return (
              <li
                key={toast.id}
                className="vb-toast flex items-center gap-3 rounded-2xl border border-surface-700/80 bg-surface-900/95 py-2 pl-4 pr-2 shadow-xl shadow-black/30 backdrop-blur-md"
              >
                <Icon aria-hidden className={`size-4 shrink-0 ${VARIANT_ICON_CLASS[toast.variant]}`} />
                <div className="min-w-0 flex-1 py-1">
                  <p className="text-sm font-medium text-surface-100">{toast.message}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-xs text-surface-400">{toast.description}</p>
                  )}
                </div>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      onDismiss(toast.id);
                      toast.action?.onClick();
                    }}
                    className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-accent-indigo transition-colors hover:bg-indigo-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
