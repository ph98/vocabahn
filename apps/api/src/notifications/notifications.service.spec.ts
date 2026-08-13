import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { countStreak, isKnownTimeZone, NotificationsService } from './notifications.service';
import type { PushProvider } from './push.provider';

const STORED_USER = {
  reminderEnabled: false,
  reminderHour: 19,
  reminderMinute: 0,
  timezone: 'Europe/Berlin',
};

describe('NotificationsService', () => {
  let prisma: {
    user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    pushSubscription: {
      count: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    card: { count: ReturnType<typeof vi.fn> };
    reviewLog: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };
  let push: { enabled: boolean; applicationServerKey: string | null; send: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...STORED_USER }),
        update: vi.fn().mockResolvedValue({}),
      },
      pushSubscription: {
        count: vi.fn().mockResolvedValue(1),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      card: { count: vi.fn().mockResolvedValue(0) },
      reviewLog: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    };
    push = { enabled: true, applicationServerKey: 'BPublicKey', send: vi.fn() };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      push as unknown as PushProvider,
    );
  });

  describe('getSettings', () => {
    it('reports the preference, the deployment’s capability, and the key separately', async () => {
      const settings = await service.getSettings('u1');
      expect(settings).toEqual({
        reminderEnabled: false,
        reminderTime: '19:00',
        timezone: 'Europe/Berlin',
        pushConfigured: true,
        vapidPublicKey: 'BPublicKey',
        deviceCount: 1,
      });
    });

    it('says push is unconfigured rather than failing when VAPID is unset', async () => {
      push.enabled = false;
      push.applicationServerKey = null;
      const settings = await service.getSettings('u1');
      expect(settings.pushConfigured).toBe(false);
      expect(settings.vapidPublicKey).toBeNull();
    });

    it('pads a single-digit hour so the client always gets HH:mm', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...STORED_USER,
        reminderHour: 7,
        reminderMinute: 5,
      });
      expect((await service.getSettings('u1')).reminderTime).toBe('07:05');
    });
  });

  describe('updateSettings', () => {
    it('splits HH:mm into the stored hour and minute', async () => {
      await service.updateSettings('u1', { reminderTime: '08:30' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { reminderHour: 8, reminderMinute: 30 },
      });
    });

    it('stores the browser’s timezone so a learner who moves is not nagged at 3am', async () => {
      await service.updateSettings('u1', { timezone: 'America/New_York' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { timezone: 'America/New_York' },
      });
    });

    it('drops a timezone Intl cannot parse rather than losing the whole save', async () => {
      await service.updateSettings('u1', {
        reminderEnabled: true,
        timezone: 'Europe/Atlantis',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { reminderEnabled: true },
      });
    });

    it('deletes every stored subscription when the reminder is turned off', async () => {
      await service.updateSettings('u1', { reminderEnabled: false });
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('keeps subscriptions when only the time changed', async () => {
      await service.updateSettings('u1', { reminderTime: '06:15' });
      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('upserts on the endpoint, so re-subscribing a browser does not add a row', async () => {
      await service.subscribe('u1', {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'key', auth: 'secret' },
        userAgent: 'Firefox',
      });
      const call = prisma.pushSubscription.upsert.mock.calls[0]![0];
      expect(call.where).toEqual({ endpoint: 'https://push.example/abc' });
      expect(call.update).toMatchObject({ userId: 'u1', p256dh: 'key', auth: 'secret' });
    });
  });

  describe('unsubscribe', () => {
    it('scopes the delete to the caller, so an endpoint cannot delete someone else’s', async () => {
      await service.unsubscribe('u1', 'https://push.example/abc');
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', endpoint: 'https://push.example/abc' },
      });
    });

    it('drops every device when no endpoint is given', async () => {
      await service.unsubscribe('u1');
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });
  });

  describe('pushToUser', () => {
    const payload = { title: 't', body: 'b', url: '/review', tag: 'tag' };

    beforeEach(() => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
        { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k2', auth: 'a2' },
      ]);
    });

    it('sends to every device the learner has', async () => {
      push.send.mockResolvedValue('sent');
      expect(await service.pushToUser('u1', payload)).toBe(2);
      expect(push.send).toHaveBeenCalledTimes(2);
    });

    it('prunes a subscription the push service reports as gone', async () => {
      push.send.mockResolvedValueOnce('gone').mockResolvedValueOnce('sent');
      expect(await service.pushToUser('u1', payload)).toBe(1);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1'] } },
      });
    });

    it('keeps a subscription that merely failed — a 500 is not a dead endpoint', async () => {
      push.send.mockResolvedValue('failed');
      expect(await service.pushToUser('u1', payload)).toBe(0);
      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it('touches lastUsedAt only for the endpoints that accepted', async () => {
      push.send.mockResolvedValueOnce('sent').mockResolvedValueOnce('failed');
      await service.pushToUser('u1', payload);
      expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1'] } },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  describe('getReminderStats', () => {
    it('counts due cards and today’s reviews against the learner’s local day', async () => {
      prisma.card.count.mockResolvedValue(12);
      prisma.reviewLog.count.mockResolvedValue(0);
      prisma.reviewLog.findMany.mockResolvedValue([
        // Two consecutive Berlin days ending yesterday.
        { reviewedAt: new Date('2026-08-11T18:00:00Z') },
        { reviewedAt: new Date('2026-08-10T18:00:00Z') },
      ]);

      const stats = await service.getReminderStats('u1', 'Europe/Berlin', '2026-08-12');
      expect(stats).toEqual({ dueToday: 12, reviewedToday: 0, streak: 2 });
    });
  });
});

describe('countStreak', () => {
  it('counts back from today when today has reviews', () => {
    const days = new Set(['2026-08-12', '2026-08-11', '2026-08-10']);
    expect(countStreak(days, '2026-08-12')).toBe(3);
  });

  it('counts back from yesterday when today has none — the streak is not broken yet', () => {
    const days = new Set(['2026-08-11', '2026-08-10']);
    expect(countStreak(days, '2026-08-12')).toBe(2);
  });

  it('is zero once a day has been missed', () => {
    expect(countStreak(new Set(['2026-08-10']), '2026-08-12')).toBe(0);
  });
});

describe('isKnownTimeZone', () => {
  it('accepts IANA zones and rejects invented ones', () => {
    expect(isKnownTimeZone('Europe/Berlin')).toBe(true);
    expect(isKnownTimeZone('UTC')).toBe(true);
    expect(isKnownTimeZone('Europe/Atlantis')).toBe(false);
  });
});
