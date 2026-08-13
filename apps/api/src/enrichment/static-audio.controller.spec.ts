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
    expect(mockTts.synthesize).toHaveBeenCalledWith('entry-123', 'Haus');
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

    expect(mockTts.synthesize).toHaveBeenCalledWith('entry-123-ex0', 'Das Haus ist groß.');
  });
});
