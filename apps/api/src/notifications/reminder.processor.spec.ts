import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from './notifications.service';
import type { PushProvider } from './push.provider';
import { ReminderProcessor } from './reminder.processor';

// 19:00 in Berlin, which is what the sole candidate below has chosen.
const AT_19_BERLIN = new Date('2026-08-12T17:00:00Z');

const CANDIDATE = {
  id: 'u1',
  timezone: 'Europe/Berlin',
  reminderHour: 19,
  reminderMinute: 0,
};

describe('ReminderProcessor', () => {
  let notifications: {
    listReminderCandidates: ReturnType<typeof vi.fn>;
    getReminderStats: ReturnType<typeof vi.fn>;
    pushToUser: ReturnType<typeof vi.fn>;
  };
  let push: { enabled: boolean };
  let redis: { set: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };
  let processor: ReminderProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_19_BERLIN);

    notifications = {
      listReminderCandidates: vi.fn().mockResolvedValue([CANDIDATE]),
      getReminderStats: vi.fn().mockResolvedValue({ dueToday: 12, reviewedToday: 0, streak: 9 }),
      pushToUser: vi.fn().mockResolvedValue(1),
    };
    push = { enabled: true };
    redis = { set: vi.fn().mockResolvedValue('OK') };
    queue = { add: vi.fn().mockResolvedValue(undefined) };

    processor = new ReminderProcessor(
      notifications as unknown as NotificationsService,
      push as unknown as PushProvider,
      redis as unknown as Redis,
      queue as unknown as Queue,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers one repeatable sweep with a fixed id, so N replicas produce one', async () => {
    await processor.onModuleInit();
    const [, , options] = queue.add.mock.calls[0]!;
    expect(options.jobId).toBe('study-reminder-repeat');
    expect(options.repeat).toEqual({ pattern: '*/15 * * * *' });
  });

  it('sends the learner’s own numbers at their own local time', async () => {
    await processor.process();
    expect(notifications.pushToUser).toHaveBeenCalledWith('u1', {
      title: '12 cards due today',
      body: '5 minutes keeps your 9-day streak.',
      url: '/review?notif=daily_reminder',
      tag: 'vocabahn-daily-reminder',
    });
  });

  it('claims the learner’s local day in Redis before deciding what to say', async () => {
    await processor.process();
    expect(redis.set).toHaveBeenCalledWith(
      'reminder:daily:u1:2026-08-12',
      '1',
      'EX',
      129_600,
      'NX',
    );
  });

  it('sends nothing when another replica already claimed the day', async () => {
    redis.set.mockResolvedValue(null);
    await processor.process();
    expect(notifications.getReminderStats).not.toHaveBeenCalled();
    expect(notifications.pushToUser).not.toHaveBeenCalled();
  });

  it('does not nag a learner who has already reviewed today', async () => {
    notifications.getReminderStats.mockResolvedValue({
      dueToday: 12,
      reviewedToday: 40,
      streak: 9,
    });
    await processor.process();
    expect(notifications.pushToUser).not.toHaveBeenCalled();
  });

  it('says nothing when there is nothing due', async () => {
    notifications.getReminderStats.mockResolvedValue({ dueToday: 0, reviewedToday: 0, streak: 9 });
    await processor.process();
    expect(notifications.pushToUser).not.toHaveBeenCalled();
  });

  it('leaves a learner whose moment has not come alone', async () => {
    vi.setSystemTime(new Date('2026-08-12T09:00:00Z')); // 11:00 in Berlin
    await processor.process();
    expect(redis.set).not.toHaveBeenCalled();
    expect(notifications.pushToUser).not.toHaveBeenCalled();
  });

  it('does nothing at all when VAPID keys are unset', async () => {
    push.enabled = false;
    await processor.process();
    expect(notifications.listReminderCandidates).not.toHaveBeenCalled();
  });

  it('keeps sweeping when one learner’s push throws', async () => {
    notifications.listReminderCandidates.mockResolvedValue([
      CANDIDATE,
      { ...CANDIDATE, id: 'u2' },
    ]);
    notifications.pushToUser.mockRejectedValueOnce(new Error('push service down'));
    await expect(processor.process()).resolves.toBeUndefined();
    expect(notifications.pushToUser).toHaveBeenCalledTimes(2);
  });
});
