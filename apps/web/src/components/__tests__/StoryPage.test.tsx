import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  interactStoryWord: vi.fn().mockResolvedValue({ success: true }),
  fetchStoryQuota: vi.fn().mockResolvedValue({ used: 1, cap: 10 }),
  fetchMe: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    cefrLevel: 'B1.1',
    interests: [],
  }),
  // Never called from a story. Looking a word up through the dictionary would
  // trigger lazy enrichment and spend the learner's daily quota, so the story
  // payload carries what the popover shows.
  fetchDictionaryEntry: vi.fn(),
}));

const {
  createStory,
  fetchStory,
  fetchLatestStory,
  completeStory,
  interactStoryWord,
  fetchStoryQuota,
  fetchDictionaryEntry,
} = await import('../../api');

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
  image: {
    url: 'https://images.unsplash.com/photo-green-house',
    authorName: 'Ada Fotograf',
    authorUrl: 'https://unsplash.com/@ada',
    sourceUrl: 'https://unsplash.com/photos/abc123',
  },
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
      pos: 'noun',
      cefrLevel: 'A1.1',
      gloss: 'building for living in',
      audioUrl: '/api/static/audio/haus.mp3',
      example: { de: 'Das Haus ist alt.', en: 'The house is old.' },
      understood: null,
    },
    {
      // Everything below the headword is null: enrichment is lazy, so a target
      // can reach a story with nothing but its spelling.
      entryId: 'e2',
      word: 'grün',
      surfaceForm: 'grün',
      translation: 'green',
      emoji: null,
      pos: null,
      cefrLevel: null,
      gloss: null,
      audioUrl: null,
      example: null,
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

  it('sends the marked words on finish and summarises them', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: "I don't know this word at all" }));
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

  describe('word popover', () => {
    /** Renders a READY story and hands back the "grün" trigger. */
    async function readStory(story: Story = READY) {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(story);
      const result = renderWithProviders(<StoryPage />);
      const word = await screen.findByRole('button', { name: 'grün' });
      return { ...result, word, user: userEvent.setup() };
    }

    it('shows what the story already knows about the word, and marks nothing', async () => {
      const { user } = await readStory();
      const haus = screen.getAllByRole('button', { name: 'Haus' })[0]!;

      await user.click(haus);

      const popover = await screen.findByRole('dialog', { name: 'About Haus' });
      expect(within(popover).getByText('noun')).toBeInTheDocument();
      expect(within(popover).getByText('A1.1')).toBeInTheDocument();
      expect(within(popover).getByText('house')).toBeInTheDocument();
      expect(within(popover).getByText('Das Haus ist alt.')).toBeInTheDocument();
      expect(within(popover).getByText('The house is old.')).toBeInTheDocument();
      // German inside an English popover has to stay marked as German.
      expect(within(popover).getByText('Das Haus ist alt.')).toHaveAttribute('lang', 'de');

      // Looking is not a comprehension signal.
      expect(haus).not.toHaveAccessibleDescription();
      expect(screen.getByText('2 of your words are in here.')).toBeInTheDocument();
    });

    it('opens on hover after a short delay', async () => {
      const { user, word } = await readStory();

      await user.hover(word);

      expect(await screen.findByRole('dialog', { name: 'About grün' })).toBeInTheDocument();
    });

    it('opens on keyboard focus', async () => {
      const { word } = await readStory();

      fireEvent.focusIn(word);

      expect(await screen.findByRole('dialog', { name: 'About grün' })).toBeInTheDocument();
    });

    it('closes on Escape and hands focus back to the word', async () => {
      const { user, word } = await readStory();
      await user.click(word);
      await screen.findByRole('dialog', { name: 'About grün' });

      await user.keyboard('{Escape}');

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'About grün' })).not.toBeInTheDocument(),
      );
      expect(word).toHaveFocus();
    });

    it('puts the controls inside the popover in the tab order after the word', async () => {
      const { user } = await readStory();
      const haus = screen.getAllByRole('button', { name: 'Haus' })[0]!;
      await user.click(haus);
      await screen.findByRole('dialog', { name: 'About Haus' });

      await user.tab();

      // The popover is a DOM sibling of the trigger, not a portal, so Tab walks
      // straight into it rather than on to the next word.
      expect(screen.getByRole('button', { name: 'Pronounce Haus' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: "I don't know this word at all" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('link', { name: 'Open in dictionary' })).toHaveFocus();
    });

    it("marks and unmarks only from the popover's own control", async () => {
      const { user, word } = await readStory();
      await user.click(word);

      const mark = await screen.findByRole('button', { name: "I don't know this word at all" });
      expect(mark).toHaveAttribute('aria-pressed', 'false');
      await user.click(mark);

      await waitFor(() => expect(mark).toHaveAttribute('aria-pressed', 'true'));
      expect(screen.getByText("1 marked as didn't land.")).toBeInTheDocument();
      // The word itself keeps its German accessible name and gains a
      // description rather than a new name.
      expect(word).toHaveAccessibleName('grün');
      expect(word).toHaveAccessibleDescription("Marked as didn't land");

      await user.click(mark);
      await waitFor(() => expect(mark).toHaveAttribute('aria-pressed', 'false'));
      expect(screen.getByText('2 of your words are in here.')).toBeInTheDocument();
    });

    it('keeps a marked word distinct in the text with the popover closed', async () => {
      const { user, word } = await readStory();
      await user.click(word);
      await user.click(await screen.findByRole('button', { name: "I don't know this word at all" }));

      await user.keyboard('{Escape}');

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'About grün' })).not.toBeInTheDocument(),
      );
      expect(word).toHaveAccessibleDescription("Marked as didn't land");
      expect(word.className).toContain('text-accent-amber');
    });

    it('records click interaction (CLICK_HARD) when clicking a word', async () => {
      const { user, word } = await readStory();
      await user.click(word);
      await waitFor(() =>
        expect(interactStoryWord).toHaveBeenCalledWith('story-1', 'e2', 'CLICK_HARD'),
      );
    });

    it('records DONT_KNOW_AGAIN interaction when marking a word unknown', async () => {
      const { user, word } = await readStory();
      await user.click(word);
      const mark = await screen.findByRole('button', { name: "I don't know this word at all" });
      await user.click(mark);
      await waitFor(() =>
        expect(interactStoryWord).toHaveBeenCalledWith('story-1', 'e2', 'DONT_KNOW_AGAIN'),
      );
    });

    it('keeps only one popover open at a time', async () => {
      const { user, word } = await readStory();
      await user.click(word);
      await screen.findByRole('dialog', { name: 'About grün' });

      await user.click(screen.getAllByRole('button', { name: 'Haus' })[0]!);

      expect(await screen.findByRole('dialog', { name: 'About Haus' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'About grün' })).not.toBeInTheDocument();
    });

    it('links through to the full dictionary entry', async () => {
      const { user, word } = await readStory();
      await user.click(word);

      expect(await screen.findByRole('link', { name: 'Open in dictionary' })).toHaveAttribute(
        'href',
        '/word/gr%C3%BCn',
      );
    });

    it('never looks the word up, so reading spends no enrichment quota', async () => {
      const { user, word } = await readStory();

      await user.hover(word);
      await screen.findByRole('dialog', { name: 'About grün' });
      await user.click(screen.getAllByRole('button', { name: 'Haus' })[0]!);
      await screen.findByRole('dialog', { name: 'About Haus' });

      expect(fetchDictionaryEntry).not.toHaveBeenCalled();
    });

    it('still gives a usable popover for a target with no enrichment yet', async () => {
      // "grün" in the fixture has nothing but a headword and a translation.
      const { user, container, word } = await readStory();

      await user.click(word);

      const popover = await screen.findByRole('dialog', { name: 'About grün' });
      expect(within(popover).getByText('green')).toBeInTheDocument();
      expect(within(popover).queryByRole('button', { name: /^Pronounce/ })).not.toBeInTheDocument();
      expect(within(popover).getByRole('link', { name: 'Open in dictionary' })).toBeInTheDocument();
      expect(within(popover).getByRole('button', { name: "I don't know this word at all" })).toBeInTheDocument();

      expect(await a11y(container)).toHaveNoViolations();
    });

    it('drops the marking control once the answers are already recorded', async () => {
      const { user, word } = await readStory({
        ...READY,
        completedAt: '2026-01-01T00:05:00.000Z',
      });

      await user.click(word);

      const popover = await screen.findByRole('dialog', { name: 'About grün' });
      expect(within(popover).queryByRole('button', { name: "I don't know this word at all" })).not.toBeInTheDocument();
      expect(within(popover).getByRole('link', { name: 'Open in dictionary' })).toBeInTheDocument();
    });
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

  describe('illustration', () => {
    it('shows a labelled image above the text and credits the photographer', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(READY);

      const { container } = renderWithProviders(<StoryPage />);

      // The alt names the story rather than restating it — decoding the German
      // is the exercise, not something to hand over in the alt text.
      const img = await screen.findByRole('img', {
        name: 'Illustration for the story: Ein grüner Tag',
      });
      expect(img).toHaveAttribute('src', 'https://images.unsplash.com/photo-green-house');
      expect(img).toHaveAttribute('loading', 'lazy');

      expect(screen.getByRole('link', { name: 'Ada Fotograf' })).toHaveAttribute(
        'href',
        'https://unsplash.com/@ada?utm_source=vocabahn&utm_medium=referral',
      );
      expect(screen.getByRole('link', { name: 'Unsplash' })).toHaveAttribute(
        'href',
        'https://unsplash.com/photos/abc123?utm_source=vocabahn&utm_medium=referral',
      );

      expect(await a11y(container)).toHaveNoViolations();
    });

    it('renders cleanly with no image at all', async () => {
      // Stories written before the feature existed, an unset UNSPLASH_ACCESS_KEY
      // and a failed lookup all arrive here as image: null.
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, image: null });

      const { container } = renderWithProviders(<StoryPage />);

      await waitFor(() => expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument());
      expect(container.querySelector('img')).toBeNull();
      expect(screen.queryByText(/Photo by/)).not.toBeInTheDocument();
      // The story itself is untouched by the missing image.
      expect(screen.getAllByRole('button', { name: 'Haus' })).toHaveLength(2);

      expect(await a11y(container)).toHaveNoViolations();
    });

    it('drops the figure entirely when the photo will not load', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue(READY);

      const { container } = renderWithProviders(<StoryPage />);
      const img = await screen.findByRole('img', { name: /Illustration for the story/ });

      fireEvent.error(img);

      // No broken-image icon, and no credit line left hanging over nothing.
      await waitFor(() => expect(container.querySelector('img')).toBeNull());
      expect(screen.queryByText(/Photo by/)).not.toBeInTheDocument();
      expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument();
    });

    it('labels the image generically when the story has no title', async () => {
      localStorage.setItem('vocabahn-story-id', 'story-1');
      vi.mocked(fetchStory).mockResolvedValue({ ...READY, title: null });

      renderWithProviders(<StoryPage />);

      expect(
        await screen.findByRole('img', { name: 'Illustration for this story' }),
      ).toBeInTheDocument();
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
