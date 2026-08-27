import type { PodcastSegment } from '@vocabahn/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PodcastPlayer } from '../PodcastPlayer';

function turn(over: Partial<PodcastSegment> & { order: number }): PodcastSegment {
  return {
    speaker: 'HOST_A',
    kind: 'TOPIC',
    text: `Turn ${over.order}`,
    translation: `English ${over.order}`,
    focusWord: null,
    audioUrl: `/audio/s${over.order}.mp3`,
    ...over,
  };
}

const SEGMENTS: PodcastSegment[] = [
  turn({ order: 0, kind: 'INTRO', text: 'Hallo und willkommen!' }),
  turn({ order: 1, speaker: 'HOST_B', kind: 'VOCAB', text: 'Was bedeutet Bahnhof?', focusWord: 'Bahnhof' }),
  turn({ order: 2, text: 'Das Haus ist grün.' }),
];

/** Plain-text rendering; StoryPage supplies the tappable-word version. */
const renderText = (text: string) => text;

describe('PodcastPlayer', () => {
  beforeEach(() => {
    // jsdom implements neither, and both are called on every advance.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders every turn as transcript, so the episode is readable without audio', () => {
    render(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />);

    expect(screen.getByText('Hallo und willkommen!')).toBeInTheDocument();
    expect(screen.getByText('Was bedeutet Bahnhof?')).toBeInTheDocument();
    expect(screen.getByText('Das Haus ist grün.')).toBeInTheDocument();
  });

  it('names the word a vocab turn exists to explain', () => {
    render(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />);

    expect(screen.getByText('Bahnhof')).toBeInTheDocument();
  });

  it('distinguishes the two hosts', () => {
    render(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />);

    expect(screen.getAllByRole('button', { name: /^Host/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Co-host/ })).toHaveLength(1);
  });

  it('hides the English until it is asked for', () => {
    const { rerender } = render(
      <PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />,
    );
    expect(screen.queryByText('English 0')).not.toBeInTheDocument();

    rerender(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish />);
    expect(screen.getByText('English 0')).toBeInTheDocument();
  });

  it('starts on the first turn and plays when asked', () => {
    render(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />);

    expect(screen.getByText('Turn 1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play episode' }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause episode' })).toBeInTheDocument();
  });

  // The whole point of one file per turn: the transcript follows the audio with
  // no timing data, because finishing a turn *is* the cue to advance.
  it('advances to the next turn when one finishes', () => {
    const { container } = render(
      <PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />,
    );
    const audio = container.querySelector('audio')!;

    fireEvent.ended(audio);

    expect(screen.getByText('Turn 2 of 3')).toBeInTheDocument();
  });

  it('returns to the start when the episode ends', () => {
    const { container } = render(
      <PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />,
    );
    const audio = container.querySelector('audio')!;

    fireEvent.ended(audio);
    fireEvent.ended(audio);
    fireEvent.ended(audio);

    expect(screen.getByText('Turn 1 of 3')).toBeInTheDocument();
  });

  it('lets the learner jump to a turn', () => {
    render(<PodcastPlayer segments={SEGMENTS} renderText={renderText} showEnglish={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: /play from here/ })[2]!);

    expect(screen.getByText('Turn 3 of 3')).toBeInTheDocument();
  });

  // A turn that failed to synthesize costs its audio and nothing else.
  it('skips over a turn with no audio instead of stalling', () => {
    const withGap = [SEGMENTS[0]!, { ...SEGMENTS[1]!, audioUrl: null }, SEGMENTS[2]!];
    const { container } = render(
      <PodcastPlayer segments={withGap} renderText={renderText} showEnglish={false} />,
    );

    fireEvent.ended(container.querySelector('audio')!);

    expect(screen.getByText('Turn 3 of 3')).toBeInTheDocument();
  });

  it('says so plainly when the episode has no audio at all', () => {
    const silent = SEGMENTS.map((s) => ({ ...s, audioUrl: null }));
    render(<PodcastPlayer segments={silent} renderText={renderText} showEnglish={false} />);

    expect(screen.getByText(/Audio is unavailable for this episode/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play episode' })).toBeDisabled();
    // Still fully readable.
    expect(screen.getByText('Hallo und willkommen!')).toBeInTheDocument();
  });
});
