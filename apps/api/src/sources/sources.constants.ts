import type { StoryTopic } from '@vocabahn/shared';

export const SOURCE_QUEUE = 'source-refresh';

/** The repeatable refresh job carries no payload — it always refreshes everything. */
export type SourceJobData = Record<string, never>;

export interface FeedDefinition {
  url: string;
  /** Publisher name, shown to the learner as attribution. */
  sourceName: string;
}

/**
 * German-language feeds per topic. Every URL here was verified to return items
 * on 2026-08-12; a feed that later dies is logged and skipped, never fatal.
 *
 * Only the feed's own `<title>` and `<description>` are ever stored — those are
 * the publisher's own precis, published for syndication. A story then *retells*
 * the item at the learner's level; it never reproduces the article. Attribution
 * and a link back to the original are rendered with every sourced story.
 *
 * `everyday` deliberately has no feed: there is no news wire for "ordinary
 * life", so that topic generates unsourced fiction, which is the honest answer.
 */
export const TOPIC_FEEDS: Partial<Record<StoryTopic, FeedDefinition[]>> = {
  news: [{ url: 'https://www.tagesschau.de/index~rss2.xml', sourceName: 'tagesschau' }],
  football: [{ url: 'https://newsfeed.kicker.de/news/aktuell', sourceName: 'kicker' }],
  sport: [{ url: 'https://www.sportschau.de/index~rss2.xml', sourceName: 'Sportschau' }],
  technology: [{ url: 'https://www.heise.de/rss/heise-atom.xml', sourceName: 'heise online' }],
  science: [
    { url: 'https://www.wissenschaft.de/feed/', sourceName: 'wissenschaft.de' },
    {
      url: 'https://www.spektrum.de/alias/rss/spektrum-de-rss-feed/996406',
      sourceName: 'Spektrum',
    },
  ],
  business: [
    { url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', sourceName: 'tagesschau' },
  ],
  world: [{ url: 'https://www.tagesschau.de/ausland/index~rss2.xml', sourceName: 'tagesschau' }],
  germany: [{ url: 'https://www.tagesschau.de/inland/index~rss2.xml', sourceName: 'tagesschau' }],
  everyday: [],
};

/** How often the repeatable job re-polls every feed. */
export const SOURCE_REFRESH_INTERVAL_MS = Number(
  process.env.SOURCE_REFRESH_INTERVAL_MS ?? 2 * 60 * 60 * 1000,
);

/** Per-request timeout for a single feed fetch. */
export const SOURCE_FETCH_TIMEOUT_MS = 15_000;

/** Items kept per feed per poll. Feeds return far more than a learner will read. */
export const SOURCE_ITEMS_PER_FEED = 20;

/**
 * A summary shorter than this is a stub — a bare headline or a paywall teaser —
 * and gives the model nothing to ground a hundred-word retelling in.
 */
export const SOURCE_MIN_SUMMARY_CHARS = 120;

/** Items older than this are dropped on refresh: yesterday's news is not a draw. */
export const SOURCE_RETENTION_DAYS = 14;

/**
 * How far back the picker will look for an unread item. Wider than a day so a
 * learner reading several stories doesn't exhaust a slow topic, but narrow
 * enough that "news" still means news.
 */
export const SOURCE_MAX_AGE_DAYS = 4;
