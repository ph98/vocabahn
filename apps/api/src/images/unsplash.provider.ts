import { Injectable, Logger } from '@nestjs/common';

/** Crop the search is biased towards. A square thumbnail and a story banner
 *  want different photographs, not the same photograph cropped twice. */
export type UnsplashOrientation = 'landscape' | 'portrait' | 'squarish';

export interface UnsplashImage {
  imageUrl: string;
  authorName: string;
  authorUrl: string | null;
  /** The photo's own page on Unsplash, linked from the credit. */
  sourceUrl: string | null;
}

interface UnsplashSearchResponse {
  results?: {
    urls?: { regular?: string };
    links?: { html?: string; download_location?: string };
    user?: { name?: string; links?: { html?: string } };
  }[];
}

@Injectable()
export class UnsplashProvider {
  private readonly logger = new Logger(UnsplashProvider.name);
  private readonly accessKey = process.env.UNSPLASH_ACCESS_KEY ?? null;

  get enabled(): boolean {
    return this.accessKey !== null;
  }

  /**
   * Top photo for the query, with the attribution the caller must store.
   *
   * Returns null when the key is unset or the search found nothing — an unset
   * key is a normal state, not an error. A transport or HTTP error throws, and
   * every caller runs this through a `safe()` wrapper: an image is polish and
   * must never cost the learner the entry or the story it decorates.
   */
  async search(
    query: string,
    orientation: UnsplashOrientation = 'squarish',
  ): Promise<UnsplashImage | null> {
    if (!this.accessKey) {
      this.logger.warn('UNSPLASH_ACCESS_KEY not set — skipping image');
      return null;
    }

    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', orientation);
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${this.accessKey}` },
      signal: AbortSignal.timeout(10000), // 10 seconds timeout
    });
    if (!res.ok) {
      throw new Error(`Unsplash search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as UnsplashSearchResponse;
    const first = data.results?.[0];
    if (!first?.urls?.regular) {
      return null;
    }

    // Both callers fetch a photo only because they are about to show it, so
    // selecting one is the moment Unsplash's guidelines call a use.
    await this.trackUse(first.links?.download_location);

    return {
      imageUrl: first.urls.regular,
      authorName: first.user?.name ?? 'Unknown',
      authorUrl: first.user?.links?.html ?? null,
      sourceUrl: first.links?.html ?? null,
    };
  }

  /**
   * Pings the photo's `download_location`, which is how Unsplash's API
   * guidelines require an application to report that it is using a photo — it
   * is what credits the photographer with the view on their side.
   *
   * Deliberately swallows everything: this is bookkeeping owed to Unsplash, and
   * failing it must not cost the learner the image we already have in hand.
   */
  private async trackUse(downloadLocation: string | undefined): Promise<void> {
    if (!downloadLocation || !this.accessKey) return;
    try {
      await fetch(downloadLocation, {
        headers: { Authorization: `Client-ID ${this.accessKey}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.warn(
        `Unsplash download tracking failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
