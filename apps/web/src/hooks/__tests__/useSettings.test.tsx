import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { describeSettingChange, settingLabel, useSettings } from '../useSettings';

/**
 * A setting key that does not exist yet, standing in for one a later issue
 * adds. `as never` because that is exactly the point: no wiring, no type entry.
 */
const FUTURE_KEY = 'pushReminders';

function Harness() {
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <button type="button" onClick={() => updateSettings({ autoplayAudio: !settings.autoplayAudio })}>
        toggle autoplay
      </button>
      <button type="button" onClick={() => updateSettings({ autoplayAudio: settings.autoplayAudio })}>
        rewrite autoplay
      </button>
      <button
        type="button"
        onClick={() => updateSettings({ [FUTURE_KEY]: true } as unknown as { autoplayAudio: boolean })}
      >
        enable future setting
      </button>
      <span data-testid="autoplay">{String(settings.autoplayAudio)}</span>
    </>
  );
}

function renderSettings() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe('useSettings', () => {
  beforeEach(() => localStorage.clear());

  it('toasts the new state of a changed setting and persists it', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'toggle autoplay' }));

    expect(screen.getByRole('status')).toHaveTextContent('Autoplay audio on');
    expect(JSON.parse(localStorage.getItem('vocabahn-settings') ?? '{}')).toMatchObject({
      autoplayAudio: true,
    });

    await user.click(screen.getByRole('button', { name: 'toggle autoplay' }));
    expect(screen.getByRole('status')).toHaveTextContent('Autoplay audio off');
  });

  it('replaces rather than stacks when the same setting is toggled repeatedly', async () => {
    const user = userEvent.setup();
    renderSettings();

    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole('button', { name: 'toggle autoplay' }));
    }

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Autoplay audio on');
  });

  it('stays silent when a write does not actually change anything', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'rewrite autoplay' }));

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('toasts a setting it has never been told about, with no extra wiring', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'enable future setting' }));

    expect(screen.getByRole('status')).toHaveTextContent('Push reminders on');
  });

  it('shows an error toast, and does not apply the change, when the write fails', async () => {
    const user = userEvent.setup();
    const failing = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    try {
      renderSettings();
      await user.click(screen.getByRole('button', { name: 'toggle autoplay' }));

      expect(screen.getByRole('status')).toHaveTextContent("Couldn't save autoplay audio");
      expect(screen.getByRole('status')).not.toHaveTextContent('Autoplay audio on');
      expect(screen.getByTestId('autoplay')).toHaveTextContent('false');
    } finally {
      failing.mockRestore();
    }
  });
});

describe('setting copy', () => {
  it('humanises unregistered keys and prefers an explicit label', () => {
    expect(settingLabel('autoplayAudio')).toBe('Autoplay audio');
    expect(settingLabel('pushReminders')).toBe('Push reminders');
    expect(settingLabel('dailyGoalCount')).toBe('Daily goal count');
  });

  it('names the value rather than saying "Saved"', () => {
    expect(describeSettingChange('autoplayAudio', true)).toBe('Autoplay audio on');
    expect(describeSettingChange('autoplayAudio', false)).toBe('Autoplay audio off');
    expect(describeSettingChange('dailyGoal', 20)).toBe('Daily goal set to 20');
  });
});
