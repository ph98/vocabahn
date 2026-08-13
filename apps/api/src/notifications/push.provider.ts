import { Injectable, Logger } from '@nestjs/common';
import type { PushPayload } from '@vocabahn/shared';
import webpush, { WebPushError } from 'web-push';

/** The stored half of a subscription, as the push library needs it back. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * What happened to one push.
 *
 * `gone` is separated from `failed` because it is the only outcome that means
 * something about the *subscription* rather than the attempt: the push service
 * is telling us this endpoint will never work again, and the row must be
 * deleted. Everything else is transient and the row is kept.
 */
export type PushResult = 'sent' | 'gone' | 'failed' | 'disabled';

/**
 * Web Push transport.
 *
 * Unset VAPID keys are a normal state, not an error — the same contract
 * `UnsplashProvider` keeps for `UNSPLASH_ACCESS_KEY`. With no keys the app
 * boots, the settings endpoint reports `pushConfigured: false`, the UI says so,
 * and `send` returns `disabled` without touching the network.
 */
@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);

  private readonly publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || null;
  /**
   * Contact address the push service can reach the sender at, required by the
   * VAPID spec. `mailto:` or an https URL.
   */
  private readonly subject =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:support@vocabahn.app';

  private configured = false;

  get enabled(): boolean {
    return this.publicKey !== null && this.privateKey !== null;
  }

  /** The key the browser needs for `PushManager.subscribe`; null when unset. */
  get applicationServerKey(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  /**
   * Sends one notification. Never throws: delivery is best-effort by design, and
   * a push failure must not be able to affect anything the learner can see.
   */
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!this.enabled) return 'disabled';
    this.ensureConfigured();

    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      );
      return 'sent';
    } catch (err) {
      // 404 Not Found / 410 Gone: the browser dropped the subscription — the
      // user cleared site data, uninstalled the PWA, or revoked permission
      // without telling us. The endpoint is dead for good.
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        return 'gone';
      }
      this.logger.warn(
        `push to ${redactEndpoint(target.endpoint)} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'failed';
    }
  }

  /**
   * `web-push` keeps VAPID details in module-level state, so this is set once on
   * first use rather than at construction — a provider that is never used in a
   * deployment with no keys should not touch the library at all.
   */
  private ensureConfigured(): void {
    if (this.configured || !this.publicKey || !this.privateKey) return;
    webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
    this.configured = true;
  }
}

/**
 * Endpoints are bearer-ish: anyone holding one can be pushed to. Log only
 * enough to tell two apart.
 */
export function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}/…${endpoint.slice(-8)}`;
  } catch {
    return '…';
  }
}
