import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';

/**
 * Renders with the same providers as the real app (router + query client +
 * toasts), each test isolated. `ToastProvider` is included because `useToast`
 * throws without it, and `useSettings` — used by several pages — calls it.
 * Rendering `<App />` here is fine: its own provider defers to this one rather
 * than mounting a second toast region.
 */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
