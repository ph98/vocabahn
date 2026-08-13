import { XMLParser } from 'fast-xml-parser';

/** One syndicated item, normalised across RSS 2.0 and Atom. */
export interface ParsedFeedItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: Date;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // Publishers mix CDATA and escaped entities in the same feed; let the parser
  // resolve both so downstream code only ever sees decoded text.
  processEntities: true,
});

/**
 * An element's text, whatever shape the parser gave it. A tag carrying
 * attributes (`<title type="html">…`) parses to an object with `#text`, a bare
 * one to a string, and a numeric-looking one to a number.
 */
function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('#text' in record) return textOf(record['#text']);
  }
  return '';
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Feed summaries routinely contain markup — an image, a wrapping `<p>`, a
 * "[mehr]" link. The model needs prose, so tags go and their text stays.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Publishers append a "[mehr]" / "[more]" read-on marker to the precis.
    .replace(/\[\s*(mehr|more)\s*\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Atom links are elements with attributes, and a feed may carry several
 * (`alternate`, `replies`, `enclosure`). The article is the alternate one,
 * which is also the default when `rel` is omitted.
 */
function atomLink(link: unknown): string {
  for (const candidate of asArray(link)) {
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      const rel = record['@_rel'];
      if (rel == null || rel === 'alternate') {
        const href = record['@_href'];
        if (typeof href === 'string') return href;
      }
    }
  }
  return '';
}

function parseDate(...candidates: unknown[]): Date | null {
  for (const candidate of candidates) {
    const raw = textOf(candidate);
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

/**
 * Parses an RSS 2.0 or Atom document into normalised items. Pure — no network,
 * no clock — so the shape of every publisher we consume is unit-testable.
 *
 * Items missing a title, a link or a usable date are dropped rather than
 * guessed at: a source item with no date cannot be ordered by recency, and one
 * with no link cannot be attributed.
 */
export function parseFeed(xml: string): ParsedFeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const rssChannel = (doc.rss as Record<string, unknown> | undefined)?.channel;
  const atomFeed = doc.feed as Record<string, unknown> | undefined;

  const rawItems = rssChannel
    ? asArray((rssChannel as Record<string, unknown>).item)
    : asArray(atomFeed?.entry);

  const items: ParsedFeedItem[] = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const title = stripHtml(textOf(item.title));
    // RSS puts the URL in the element body; Atom puts it in a href attribute.
    const url = rssChannel ? textOf(item.link).trim() : atomLink(item.link);
    // `description` (RSS) and `summary` (Atom) are the publisher's own precis.
    // `content:encoded` is the full syndicated body and is used only as a last
    // resort, truncated, when a feed ships no precis at all.
    const summary =
      stripHtml(textOf(item.description)) ||
      stripHtml(textOf(item.summary)) ||
      stripHtml(textOf(item['content:encoded'] ?? item.content)).slice(0, 600);
    const publishedAt = parseDate(item.pubDate, item.published, item['dc:date'], item.updated);

    if (!title || !url || !publishedAt) continue;

    items.push({ title, url, summary, publishedAt });
  }

  return items;
}
