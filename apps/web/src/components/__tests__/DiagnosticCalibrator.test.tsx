import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { CalibrateDiagnosticResponse, DiagnosticProbeItem, User } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { DiagnosticCalibrator } from '../DiagnosticCalibrator';

vi.mock('../../api', () => ({
  fetchDiagnosticProbe: vi.fn(),
  calibrateDiagnostic: vi.fn(),
}));

const { fetchDiagnosticProbe, calibrateDiagnostic } = await import('../../api');

const MOCK_PROBES: DiagnosticProbeItem[] = [
  { id: 'probe-1', word: 'Hallo', isReal: true, cefrLevel: 'A1.1', translation: 'hello' },
  { id: 'probe-2', word: 'Wasser', isReal: true, cefrLevel: 'A1.2', translation: 'water' },
  { id: 'probe-3', word: 'knörig', isReal: false, cefrLevel: null, translation: null },
];

const MOCK_USER: User = {
  id: 'user-1',
  email: 'learner@vocabahn.test',
  name: 'Learner',
  avatarUrl: null,
  cefrLevel: 'B1.2',
  interests: [],
};

const MOCK_RESULT: CalibrateDiagnosticResponse = {
  user: MOCK_USER,
  estimatedCefrLevel: 'B1.2',
  estimatedCefrIndex: 5,
  estimatedVocabSize: 2850,
  confidenceScore: 0.95,
  falseAlarmRate: 0.0,
  graduatedCount: 42,
  graduatedWords: ['Hallo', 'Wasser', 'Brot', 'Haus'],
  frontierWords: [
    { id: 'fw-1', word: 'auswirken', translation: 'have an effect', emoji: '⚡', cefrLevel: 'B1.2' },
  ],
  breakdown: [
    { cefrLevel: 'A1.1', accuracy: 1.0, sampleCount: 3, status: 'MASTERED' },
    { cefrLevel: 'A1.2', accuracy: 1.0, sampleCount: 3, status: 'MASTERED' },
    { cefrLevel: 'A2.1', accuracy: 0.9, sampleCount: 3, status: 'MASTERED' },
    { cefrLevel: 'A2.2', accuracy: 0.85, sampleCount: 3, status: 'MASTERED' },
    { cefrLevel: 'B1.1', accuracy: 0.75, sampleCount: 3, status: 'MASTERED' },
    { cefrLevel: 'B1.2', accuracy: 0.5, sampleCount: 3, status: 'FRONTIER' },
    { cefrLevel: 'B2.1', accuracy: 0.2, sampleCount: 3, status: 'LEARNING' },
    { cefrLevel: 'B2.2', accuracy: 0.1, sampleCount: 3, status: 'LEARNING' },
    { cefrLevel: 'C1.1', accuracy: 0.0, sampleCount: 3, status: 'LEARNING' },
    { cefrLevel: 'C1.2', accuracy: 0.0, sampleCount: 3, status: 'LEARNING' },
    { cefrLevel: 'C2.1', accuracy: 0.0, sampleCount: 3, status: 'LEARNING' },
    { cefrLevel: 'C2.2', accuracy: 0.0, sampleCount: 3, status: 'LEARNING' },
  ],
};

describe('DiagnosticCalibrator', () => {
  it('walks through questions and displays calibrated results with no accessibility violations', async () => {
    vi.mocked(fetchDiagnosticProbe).mockResolvedValue(MOCK_PROBES);
    vi.mocked(calibrateDiagnostic).mockResolvedValue(MOCK_RESULT);

    const onComplete = vi.fn();
    const { container } = renderWithProviders(<DiagnosticCalibrator onComplete={onComplete} />);

    // Step 1: probe question 1
    await waitFor(() => expect(screen.getByText('Hallo')).toBeInTheDocument());
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // Peek translation
    fireEvent.click(screen.getByText('Peek translation'));
    expect(screen.getByText('hello')).toBeInTheDocument();

    // Answer "Know it"
    fireEvent.click(screen.getByRole('button', { name: /Know it/i }));

    // Step 2: probe question 2
    await waitFor(() => expect(screen.getByText('Wasser')).toBeInTheDocument());
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Know it/i }));

    // Step 3: probe question 3 (pseudo-word)
    await waitFor(() => expect(screen.getByText('knörig')).toBeInTheDocument());
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Don't know/i }));

    // Calibration submission
    await waitFor(() => expect(calibrateDiagnostic).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(MOCK_RESULT);

    // Results screen
    await waitFor(() => expect(screen.getByText('Your Calibrated German Profile')).toBeInTheDocument());
    expect(screen.getByText('~2,850')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('auswirken')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
