import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationSettings } from '@vocabahn/shared';
import { useCallback, useState } from 'react';
import {
  fetchNotificationSettings,
  registerPushSubscription,
  removePushSubscription,
  updateNotificationSettings,
} from '../api';
import { useToast } from '../components/Toast';
import { trackEvent } from '../lib/telemetry';
import {
  currentPermission,
  describePushSupport,
  PushPermissionDeniedError,
  subscribeToPush,
  unsubscribeFromPush,
  type NotificationPermissionState,
  type PushSupport,
} from '../lib/push';

export const NOTIFICATION_SETTINGS_KEY = ['notification-settings'] as const;

export interface ReminderControls {
  settings: NotificationSettings | undefined;
  isPending: boolean;
  /** Whether this browser could subscribe at all, and why not when it cannot. */
  support: PushSupport;
  /** The browser's own permission state, which is not ours to change. */
  permission: NotificationPermissionState;
  /** A request is in flight; the control should be disabled, not hidden. */
  isSaving: boolean;
  enable: () => void;
  disable: () => void;
  setTime: (time: string) => void;
}

/**
 * The daily study reminder, as one hook.
 *
 * It exists to keep three separate truths from being collapsed into a single
 * boolean by whichever component renders them: the learner's server-side
 * preference, the browser's one-shot permission grant, and whether push works
 * on this device at all. `ProfilePage` renders a different explanation for
 * each, and can only do that if the hook keeps them apart.
 *
 * Nothing here fires the permission prompt on mount. `enable()` is the only
 * path to it, and it is called from a click.
 */
export function useNotificationSettings(enabled = true): ReminderControls {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Read once per render pass rather than subscribed to: `Notification.permission`
  // has no change event worth relying on, and the states that matter here are
  // reached through actions this hook already runs.
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission);
  const support = describePushSupport();

  const query = useQuery({
    queryKey: NOTIFICATION_SETTINGS_KEY,
    queryFn: fetchNotificationSettings,
    enabled,
    staleTime: 60_000,
  });

  const applySettings = useCallback(
    (settings: NotificationSettings) => {
      queryClient.setQueryData(NOTIFICATION_SETTINGS_KEY, settings);
    },
    [queryClient],
  );

  const enableMutation = useMutation({
    mutationFn: async () => {
      const vapidPublicKey = query.data?.vapidPublicKey;
      if (!vapidPublicKey) {
        throw new Error('Reminders are not configured on this server');
      }
      const subscription = await subscribeToPush(vapidPublicKey);
      await registerPushSubscription(subscription);
      // The preference is written after the subscription exists, so a learner
      // who dismisses the prompt is never left "on" with nothing to send to.
      return updateNotificationSettings({ reminderEnabled: true });
    },
    onSuccess: (settings) => {
      setPermission(currentPermission());
      applySettings(settings);
      trackEvent('notification_opt_in', { reminder_time: settings.reminderTime });
      toast.success('Daily reminder on', {
        id: 'setting:reminderEnabled',
        description: `We'll nudge you at ${settings.reminderTime} your time.`,
      });
    },
    onError: (error) => {
      setPermission(currentPermission());
      if (error instanceof PushPermissionDeniedError) {
        toast.error("Your browser didn't allow notifications", {
          id: 'setting:reminderEnabled',
          description: 'You can re-enable them for this site in your browser settings.',
        });
        return;
      }
      toast.error("Couldn't turn on reminders", {
        id: 'setting:reminderEnabled',
        description: 'Nothing was changed. Please try again.',
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      // Detach this browser precisely first, then turn the preference off. The
      // second call is the authoritative one — it deletes every stored
      // subscription for the account — so a failure in either best-effort step
      // above still ends with nothing left to push to.
      try {
        const endpoint = await unsubscribeFromPush();
        if (endpoint) await removePushSubscription(endpoint);
      } catch {
        // The browser refused, or this device was already unknown to us.
      }
      return updateNotificationSettings({ reminderEnabled: false });
    },
    onSuccess: (settings) => {
      applySettings(settings);
      trackEvent('notification_opt_out');
      toast.success('Daily reminder off', { id: 'setting:reminderEnabled' });
    },
    onError: () => {
      toast.error("Couldn't turn off reminders", {
        id: 'setting:reminderEnabled',
        description: 'The setting is unchanged. Please try again.',
      });
    },
  });

  const timeMutation = useMutation({
    mutationFn: (reminderTime: string) => updateNotificationSettings({ reminderTime }),
    onSuccess: (settings) => {
      applySettings(settings);
      toast.success(`Reminder set for ${settings.reminderTime}`, { id: 'setting:reminderTime' });
    },
    onError: () => {
      // Fall back to what the server last told us rather than leaving the input
      // showing a time that was never stored.
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_SETTINGS_KEY });
      toast.error("Couldn't save the reminder time", { id: 'setting:reminderTime' });
    },
  });

  return {
    settings: query.data,
    isPending: query.isPending,
    support,
    permission,
    isSaving: enableMutation.isPending || disableMutation.isPending || timeMutation.isPending,
    enable: () => enableMutation.mutate(),
    disable: () => disableMutation.mutate(),
    setTime: (time: string) => timeMutation.mutate(time),
  };
}
