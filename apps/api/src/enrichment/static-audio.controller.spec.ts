import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { TtsProvider } from '../tts/tts.provider';
import { StaticAudioController } from './static-audio.controller';

type MockPrisma = {
  dictionaryEntry: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  story: { findUnique: ReturnType<typeof vi.fn> };
  storySegment: { findUnique: ReturnType<typeof vi.fn> };
};

type MockTts = {
  enabled: boolean;
  synthesize: ReturnType<typeof vi.fn>;
};

describe('StaticAudioController', () => {
  let controller: StaticAudioController;
  let mockPrisma: MockPrisma;
  let mockTts: MockTts;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockPrisma = {
      dictionaryEntry: {
        findUnique: vi.fn(),
      },
      story: { findUnique: vi.fn().mockResolvedValue(null) },
      storySegment: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    mockTts = {
      enabled: true,
      synthesize: vi.fn(),
    };

    mockResponse = {
      setHeader: vi.fn(),
    };

    controller = new StaticAudioController(
      mockPrisma as unknown as PrismaService,
      mockTts as unknown as TtsProvider,
    );
  });

  it('rejects invalid file extension', async () => {
    await expect(
      controller.getAudioFile('invalid-file.wav', mockResponse as Response),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when entry does not exist and TTS cannot synthesize', async () => {
    mockPrisma.dictionaryEntry.findUnique.mockResolvedValue(null);

    await expect(
      controller.getAudioFile('nonexistent-id.mp3', mockResponse as Response),
    ).rejects.toThrow(NotFoundException);
  });

  it('attempts TTS synthesis for entry headword when missing from disk', async () => {
    mockPrisma.dictionaryEntry.findUnique.mockResolvedValue({
      id: 'entry-123',
      word: 'Haus',
    });
    mockTts.synthesize.mockResolvedValue(null); // synthesis unavailable

    await expect(
      controller.getAudioFile('entry-123.mp3', mockResponse as Response),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.dictionaryEntry.findUnique).toHaveBeenCalledWith({
      where: { id: 'entry-123' },
      select: { id: true, word: true },
    });
    expect(mockTts.synthesize).toHaveBeenCalledWith('entry-123', 'Haus', {});
  });

  it('attempts TTS synthesis for example sentence when missing from disk', async () => {
    mockPrisma.dictionaryEntry.findUnique.mockResolvedValue({
      id: 'entry-123',
      examples: [{ order: 0, de: 'Das Haus ist groß.' }],
    });
    mockTts.synthesize.mockResolvedValue(null);

    await expect(
      controller.getAudioFile('entry-123-ex0.mp3', mockResponse as Response),
    ).rejects.toThrow(NotFoundException);

    expect(mockTts.synthesize).toHaveBeenCalledWith('entry-123-ex0', 'Das Haus ist groß.', {});
  });

  describe('podcast turn recovery', () => {
    // `static/audio` is container-local, so a redeploy wipes it. Stories
    // re-synthesize from the database; before this, a turn keyed
    // `story-<id>-s3` was read as a story with id "<id>-s3", found nothing, and
    // 404'd — so every episode went permanently silent while stories healed.
    it('re-synthesizes a missing turn from its segment row', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue({
        text: 'Hallo und willkommen!',
        speaker: 'HOST_A',
      });
      mockTts.synthesize.mockResolvedValue(null);

      await expect(
        controller.getAudioFile('story-abc123-s3.mp3', mockResponse as Response),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.storySegment.findUnique).toHaveBeenCalledWith({
        where: { storyId_order: { storyId: 'abc123', order: 3 } },
        select: { text: true, speaker: true },
      });
      expect(mockPrisma.story.findUnique).not.toHaveBeenCalled();
    });

    // A healed turn in the other host's voice is worse than a silent one.
    it('recovers a turn in the voice it was recorded in', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue({
        text: 'Schön, dass du da bist.',
        speaker: 'HOST_B',
      });
      mockTts.synthesize.mockResolvedValue(null);

      await expect(
        controller.getAudioFile('story-abc123-s1.mp3', mockResponse as Response),
      ).rejects.toThrow(NotFoundException);

      expect(mockTts.synthesize).toHaveBeenCalledWith(
        'story-abc123-s1',
        'Schön, dass du da bist.',
        expect.objectContaining({ provider: 'google', voice: 'de-DE-Neural2-C' }),
      );
    });

    it('still treats a plain story key as a whole story', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({ text: 'Das Haus ist grün.' });
      mockTts.synthesize.mockResolvedValue(null);

      await expect(
        controller.getAudioFile('story-abc123.mp3', mockResponse as Response),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.story.findUnique).toHaveBeenCalledWith({
        where: { id: 'abc123' },
        select: { text: true },
      });
      expect(mockPrisma.storySegment.findUnique).not.toHaveBeenCalled();
    });
  });
});
