import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { User } from '@vocabahn/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { CEFRCalibrationCard } from '../CEFRCalibrationCard';

vi.mock('../../api', () => ({
  updateCefrLevel: vi.fn(),
}));

const { updateCefrLevel } = await import('../../api');

const MOCK_USER: User = {
  id: 'user-1',
  email: 'test@vocabahn.test',
  name: 'Test Learner',
  avatarUrl: null,
  cefrLevel: null,
};

describe('CEFRCalibrationCard', () => {
  it('renders calibration choices and allows setting a level', async () => {
    vi.mocked(updateCefrLevel).mockResolvedValue({
      user: { ...MOCK_USER, cefrLevel: 'B1.1' },
      graduation: { count: 3, words: ['hallo', 'danke', 'ja'] },
    });

    renderWithProviders(<CEFRCalibrationCard user={MOCK_USER} />);

    expect(screen.getByText('Set Your German CEFR Level')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('Intermediate')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Set Level to B1/i });
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateCefrLevel).toHaveBeenCalledWith('B1.1'));
    expect(screen.getByText('German Level Calibrated!')).toBeInTheDocument();
  });
});
