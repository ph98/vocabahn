import { Injectable, Logger } from '@nestjs/common';

export interface UnsplashImage {
  imageUrl: string;
  authorName: string;
  authorUrl: string | null;
  sourceUrl: string | null;
}

interface UnsplashSearchResponse {
  results?: {
    urls?: { regular?: string };
    links?: { html?: string };
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

  /** Top squarish photo for the query, with attribution to store (PRD §7). */
  async search(query: string): Promise<UnsplashImage | null> {
    if (!this.accessKey) {
      this.logger.warn('UNSPLASH_ACCESS_KEY not set — skipping image');
      return null;
    }

    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'squarish');
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${this.accessKey}` },
    });
    if (!res.ok) {
      throw new Error(`Unsplash search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as UnsplashSearchResponse;
    const first = data.results?.[0];
    if (!first?.urls?.regular) {
      return null;
    }

    return {
      imageUrl: first.urls.regular,
      authorName: first.user?.name ?? 'Unknown',
      authorUrl: first.user?.links?.html ?? null,
      sourceUrl: first.links?.html ?? null,
    };
  }
}
