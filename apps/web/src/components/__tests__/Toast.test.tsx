import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { TOAST_REGION, ToastProvider, useToast, type ToastOptions } from '../Toast';

/** Renders a button per scripted call so tests drive the API through real clicks. */
function Harness({ calls }: { calls: { label: string; run: (t: ReturnType<typeof useToast>) => void }[] }) {
  const toast = useToast();
  return (
    <>
      {calls.map(({ label, run }) => (
        <button key={label} type="button" onClick={() => run(toast)}>
          {label}
        </button>
      ))}
    </>
  );
}

function renderToasts(calls: { label: string; run: (t: ReturnType<typeof useToast>) => void }[]) {
  return render(
    <ToastProvider>
      <Harness calls={calls} />
    </ToastProvider>,
  );
}

const fire = (message: string, options?: ToastOptions) => (t: ReturnType<typeof useToast>) =>
  t.success(message, options);

describe('Toast', () => {
  it('mounts a polite live region before anything is shown', () => {
    renderToasts([]);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'false');
    expect(within(status).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('announces a toast politely and dismisses it manually', async () => {
    const user = userEvent.setup();
    renderToasts([{ label: 'fire', run: fire('Autoplay audio on') }]);

    await user.click(screen.getByRole('button', { name: 'fire' }));

    const status = screen.getByRole('status');
    expect(within(status).getByText('Autoplay audio on')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Autoplay audio on')).not.toBeInTheDocument();
  });

  it('stacks distinct toasts but replaces ones sharing an id', async () => {
    const user = userEvent.setup();
    renderToasts([
      { label: 'on', run: fire('Autoplay audio on', { id: 'setting:autoplayAudio' }) },
      { label: 'off', run: fire('Autoplay audio off', { id: 'setting:autoplayAudio' }) },
      { label: 'other', run: fire('Daily goal set to 20', { id: 'setting:dailyGoal' }) },
    ]);

    await user.click(screen.getByRole('button', { name: 'on' }));
    await user.click(screen.getByRole('button', { name: 'off' }));
    await user.click(screen.getByRole('button', { name: 'on' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Autoplay audio on')).toBeInTheDocument();
    expect(screen.queryByText('Autoplay audio off')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'other' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps at most three toasts on screen, dropping the oldest', async () => {
    const user = userEvent.setup();
    renderToasts(
      ['a', 'b', 'c', 'd'].map((label) => ({ label, run: fire(`Toast ${label}`) })),
    );

    for (const label of ['a', 'b', 'c', 'd']) {
      await user.click(screen.getByRole('button', { name: label }));
    }

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Toast a')).not.toBeInTheDocument();
    expect(screen.getByText('Toast d')).toBeInTheDocument();
  });

  it('auto-dismisses after its duration, and never when the duration is 0', async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <ToastProvider>
          <Harness
            calls={[
              { label: 'timed', run: fire('Goes away', { duration: 3000 }) },
              { label: 'sticky', run: fire('Stays put', { duration: 0 }) },
            ]}
          />
        </ToastProvider>,
      );

      act(() => {
        (container.querySelector('button') as HTMLButtonElement).click();
        (container.querySelectorAll('button')[1] as HTMLButtonElement).click();
      });

      expect(screen.getByText('Goes away')).toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(2999));
      expect(screen.getByText('Goes away')).toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(2));
      expect(screen.queryByText('Goes away')).not.toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(60_000));
      expect(screen.getByText('Stays put')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders an optional action button that dismisses the toast before running', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderToasts([
      { label: 'fire', run: (t) => t.info('Rated Good', { action: { label: 'Undo', onClick } }) },
    ]);

    await user.click(screen.getByRole('button', { name: 'fire' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Rated Good')).not.toBeInTheDocument();
  });

  it('exposes a stable api object and a dismissable id', async () => {
    const user = userEvent.setup();
    const seen: ReturnType<typeof useToast>[] = [];
    let id = '';

    function Recorder() {
      const toast = useToast();
      seen.push(toast);
      return (
        <>
          <button type="button" onClick={() => { id = toast.success('Saved'); }}>
            fire
          </button>
          <button type="button" onClick={() => toast.dismiss(id)}>
            close
          </button>
        </>
      );
    }

    render(
      <ToastProvider>
        <Recorder />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(new Set(seen).size).toBe(1);

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('defers to an ancestor provider rather than mounting a second region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastProvider>
          <Harness calls={[{ label: 'fire', run: fire('Only once') }]} />
        </ToastProvider>
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'fire' }));

    expect(screen.getAllByRole('region', { name: 'Notifications' })).toHaveLength(1);
    expect(screen.getAllByText('Only once')).toHaveLength(1);
  });

  it('throws a directed error when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Harness calls={[]} />)).toThrow(/ToastProvider/);
    } finally {
      spy.mockRestore();
    }
  });

  it('positions the region with the shared floating-UI custom properties', () => {
    const { container } = renderToasts([]);
    expect(container.querySelector('.vb-toast-region')).toBeInTheDocument();
    expect(TOAST_REGION.insetBottom).toBe('var(--vb-toast-inset-bottom)');
    expect(TOAST_REGION.maxWidth).toBe('var(--vb-toast-max-width)');
    expect(TOAST_REGION.zIndex).toBe('var(--vb-toast-z)');
  });

  it('has no accessibility violations with toasts on screen', async () => {
    const user = userEvent.setup();
    const { container } = renderToasts([
      { label: 'plain', run: fire('Autoplay audio on') },
      {
        label: 'rich',
        run: (t) =>
          t.error('Could not save', {
            description: 'Your browser refused to store the change.',
            action: { label: 'Retry', onClick: () => {} },
          }),
      },
    ]);

    await user.click(screen.getByRole('button', { name: 'plain' }));
    await user.click(screen.getByRole('button', { name: 'rich' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    expect(await axe(container)).toHaveNoViolations();
  });
});
