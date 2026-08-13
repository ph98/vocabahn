import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Story } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { StoryPage } from '../StoryPage';

vi.mock('../../api', () => ({
  createStory: vi.fn(),
  fetchStory: vi.fn(),
  fetchLatestStory: vi.fn(),
  completeStory: vi.fn(),
  fetchStoryQuota: vi.fn().mockResolvedValue({ used: 1, cap: 10 }),
}));

const { createStory, fetchStory, fetchLatestStory, completeStory, fetchStoryQuota } =
  await import('../../api');

/**
 * axe preloads media metadata before running, and jsdom never fires
 * `loadedmetadata` for the narration `<audio>`, so the default call hangs.
 */
const a11y = (container: Element) => axe(container, { preload: false });

const READY: Story = {
  id: 'story-1',
  status: 'READY',
  stage: null,
  origin: 'ON_DEMAND',
  topic: 'football',
  source: {
    title: 'PSG schafft den Supercup-Doppelpack',
    url: 'https://www.kicker.de/psg-1242244/artikel',
    name: 'kicker',
    publishedAt: '2026-08-12T20:55:54.000Z',
  },
  cefrLevel: 'A2.1',
  title: 'Ein grüner Tag',
  text: 'Das Haus ist grün. Anna geht zum Haus.',
  translation: 'The house is green. Anna walks to the house.',
  audioUrl: '/api/static/audio/story-story-1.mp3',
  error: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  targets: [
    {
      entryId: 'e1',
      word: 'Haus',
      surfaceForm: 'Haus',
      translation: 'house',
      emoji: '🏠',
      understood: null,
    },
    {
      entryId: 'e2',
      word: 'grün',
      surfaceForm: 'grün',
      translation: 'green',
      emoji: null,
      understood: null,
    },
  ],
};

describe('StoryPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // Call history only — implementations set below survive this.
    vi.clearAllMocks();
    vi.mocked(fetchStoryQuota).mockResolvedValue({ used: 1, cap: 10 });
    vi.mocked(fetchLatestStory).mockResolvedValue(null);
  });

  it('offers to write a story with no accessibility violations', async () => {
    const { container } = renderWithProviders(<StoryPage />);

    expect(
      await screen.findByRole('button', { name: 'Find me something to read' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('9 of 10 left today')).toBeInTheDocument());

    expect(await a11y(container)).toHaveNoViolations();
  });

  it('shows a writing state while the story generates', async () => {
    vi.mocked(createStory).mockResolvedValue({ ...READY, status: 'PENDING', text: null });
    vi.mocked(fetchStory).mockResolvedValue({ ...READY, status: 'GENERATING', text: null });

    const { container } = renderWithProviders(<StoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Find me something to read' }));

    await waitFor(() =>
      expect(screen.getByText('Rewriting the article at your level…')).toBeInTheDocument(),
    );

    expect(await a11y(container)).toHaveNoViolations();
  });

  it('renders the story with studied words as buttons', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);

    const { container } = renderWithProviders(<StoryPage />);

    await waitFor(() => expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument());
    // "Haus" appears twice in the text; both occurrences are tappable.
    expect(screen.getAllByRole('button', { name: 'Haus' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'grün' })).toBeInTheDocument();

    expect(await a11y(container)).toHaveNoViolations();
  });

  it("marks a word as didn't land when tapped and shows its translation", async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);

    renderWithProviders(<StoryPage />);
    const word = await screen.findByRole('button', { name: 'grün' });
    expect(word).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(word);

    await waitFor(() => expect(word).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('— green')).toBeInTheDocument();
    expect(screen.getByText("1 marked as didn't land.")).toBeInTheDocument();
  });

  it('unmarks a word when tapped again', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);

    renderWithProviders(<StoryPage />);
    const word = await screen.findByRole('button', { name: 'grün' });

    fireEvent.click(word);
    await waitFor(() => expect(word).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(word);

    await waitFor(() => expect(word).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByText('2 of your words are in here.')).toBeInTheDocument();
  });

  it('sends the tapped words on finish and summarises them', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);
    vi.mocked(completeStory).mockResolvedValue({
      ...READY,
      completedAt: '2026-01-01T00:05:00.000Z',
      targets: [
        { ...READY.targets[0]!, understood: true },
        { ...READY.targets[1]!, understood: false },
      ],
    });

    const { container } = renderWithProviders(<StoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'grün' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish reading' }));

    await waitFor(() => expect(completeStory).toHaveBeenCalledWith('story-1', ['e2']));
    expect(await screen.findByText("1 of 2 words didn't land.")).toBeInTheDocument();

    expect(await a11y(container)).toHaveNoViolations();
  });

  it('plays and pauses the narration', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);
    // jsdom has no media stack; play/pause are undefined without this.
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);

    const { container } = renderWithProviders(<StoryPage />);

    const button = await screen.findByRole('button', { name: 'Play narration' });
    const audio = container.querySelector('audio')!;
    expect(audio).toHaveAttribute('src', '/api/static/audio/story-story-1.mp3');

    fireEvent.click(button);
    expect(play).toHaveBeenCalled();

    // The label follows the element's own events, not the click.
    fireEvent.play(audio);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pause narration' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pause narration' }));
    fireEvent.pause(audio);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play narration' })).toBeInTheDocument(),
    );

    expect(await a11y(container)).toHaveNoViolations();
    vi.restoreAllMocks();
  });

  it('degrades gracefully when the narration file will not load', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);

    const { container } = renderWithProviders(<StoryPage />);
    await screen.findByRole('button', { name: 'Play narration' });

    fireEvent.error(container.querySelector('audio')!);

    expect(await screen.findByText('Narration is unavailable for this story.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play narration' })).not.toBeInTheDocument();
  });

  it('hides the narration control when synthesis produced nothing', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue({ ...READY, audioUrl: null });

    renderWithProviders(<StoryPage />);

    await waitFor(() => expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Play narration' })).not.toBeInTheDocument();
  });

  it('reveals the English translation on demand', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue(READY);

    renderWithProviders(<StoryPage />);
    const toggle = await screen.findByRole('button', { name: 'Show English' });
    expect(screen.queryByText(READY.translation!)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await screen.findByText(READY.translation!)).toBeInTheDocument();
  });

  it('points at the library when there are no words to build from', async () => {
    vi.mocked(createStory).mockRejectedValue(
      Object.assign(new Error('no words'), {
        isAxiosError: true,
        response: { status: 400 },
      }),
    );

    const { container } = renderWithProviders(<StoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Find me something to read' }));

    expect(
      await screen.findByText('No words to build a story from yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the library' })).toHaveAttribute(
      'href',
      '/library',
    );

    expect(await a11y(container)).toHaveNoViolations();
  });

  it('offers a retry when generation failed', async () => {
    localStorage.setItem('vocabahn-story-id', 'story-1');
    vi.mocked(fetchStory).mockResolvedValue({
      ...READY,
      status: 'FAILED',
      text: null,
      error: 'only 1/8 target words verified',
      targets: [],
    });

    const { container } = renderWithProviders(<StoryPage />);

    expect(await screen.findByText("Your story couldn't be written.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    expect(await a11y(container)).toHaveNoViolations();
  });

  describe('topics', () => {
    it('sends the chosen subject to the server', async () => {
      vi.mocked(createStory).mockResolvedValue({ ...READY, status: 'PENDING', text: null });
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, status: 'PENDING', text: null });

      renderWithProviders(<StoryPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Technology/ }));

      // The call to action names the subject, so the learner can see what they
      // are about to get before spending one of their ten.
      fireEvent.click(screen.getByRole('button', { name: 'Read about technology' }));

      await waitFor(() => expect(createStory).toHaveBeenCalledWith('technology'));
    });

    it('asks for no particular subject by default', async () => {
      vi.mocked(createStory).mockResolvedValue({ ...READY, status: 'PENDING', text: null });
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, status: 'PENDING', text: null });

      renderWithProviders(<StoryPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Find me something to read' }));

      // undefined, not null — the server reads "absent" as "use my interests".
      await waitFor(() => expect(createStory).toHaveBeenCalledWith(undefined));
    });

    it('shows the subject alongside the level', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(READY);

      renderWithProviders(<StoryPage />);

      expect(await screen.findByText('Football')).toBeInTheDocument();
      expect(screen.getByText('Level A2.1')).toBeInTheDocument();
    });
  });

  describe('source attribution', () => {
    it('credits the publisher and links to the original', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(READY);

      const { container } = renderWithProviders(<StoryPage />);

      expect(await screen.findByText('Retold from kicker')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /PSG schafft den Supercup-Doppelpack/ });
      expect(link).toHaveAttribute('href', 'https://www.kicker.de/psg-1242244/artikel');
      // An outbound link to a third party must not hand over the referrer or
      // window.opener.
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('target', '_blank');

      expect(await a11y(container)).toHaveNoViolations();
    });

    it('shows no credit for a story written without a source', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, source: null, topic: 'everyday' });

      renderWithProviders(<StoryPage />);

      await waitFor(() => expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument());
      expect(screen.queryByText(/Retold from/)).not.toBeInTheDocument();
    });

    it('shows the headline while the retelling is still being written', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue({
        ...READY,
        status: 'GENERATING',
        stage: 'WRITING',
        text: null,
      });

      renderWithProviders(<StoryPage />);

      // The article is known the moment the row is created, so the wait has
      // something to read rather than a bare spinner. The publisher and the
      // headline sit in separate elements (the latter is lang="de"), so match
      // on the paragraph's combined text.
      const line = await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === 'From kicker: PSG schafft den Supercup-Doppelpack',
      );
      expect(line).toBeInTheDocument();
    });

    it('names the narration step separately from the writing step', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue({
        ...READY,
        status: 'GENERATING',
        stage: 'NARRATING',
        text: null,
      });

      renderWithProviders(<StoryPage />);

      expect(await screen.findByText('Recording the narration…')).toBeInTheDocument();
      expect(screen.getByText('Almost there — the text is written.')).toBeInTheDocument();
    });
  });

  describe("today's read", () => {
    it('shows a story the scheduler left, with no id in this browser', async () => {
      // The overnight story was created on nobody's device, so localStorage is
      // empty — /stories/latest is the only way it is ever found.
      vi.mocked(fetchLatestStory).mockResolvedValue({ ...READY, origin: 'DAILY' });
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, origin: 'DAILY' });

      const { container } = renderWithProviders(<StoryPage />);

      expect(await screen.findByText("Today's read")).toBeInTheDocument();
      expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Find me something to read' }),
      ).not.toBeInTheDocument();

      expect(await a11y(container)).toHaveNoViolations();
    });

    it('does not label an on-demand story as today’s read', async () => {
      vi.mocked(fetchLatestStory).mockResolvedValue(READY);
      vi.mocked(fetchStory).mockResolvedValue(READY);

      renderWithProviders(<StoryPage />);

      await waitFor(() => expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument());
      expect(screen.queryByText("Today's read")).not.toBeInTheDocument();
    });

    it('returns to the chooser after finishing rather than rerolling', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(READY);
      vi.mocked(completeStory).mockResolvedValue({
        ...READY,
        completedAt: '2026-01-01T00:05:00.000Z',
      });

      renderWithProviders(<StoryPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Finish reading' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Read something else' }));

      // Back to picking a subject, and nothing generated behind their back.
      expect(
        await screen.findByRole('button', { name: 'Find me something to read' }),
      ).toBeInTheDocument();
      expect(createStory).not.toHaveBeenCalled();
    });
  });
});
