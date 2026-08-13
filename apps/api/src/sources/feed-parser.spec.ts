import { describe, expect, it } from 'vitest';
import { parseFeed, stripHtml } from './feed-parser';

// The fixtures below are trimmed but otherwise verbatim responses captured from
// each publisher on 2026-08-12. Each one exercises a different way of encoding
// the same three things, which is the whole reason this parser exists.

// tagesschau: RSS 2.0, plain-text description, dc:date alongside pubDate.
const TAGESSCHAU = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>tagesschau.de</title>
    <item>
      <title>Millionen verfolgen Sonnenfinsternis über Deutschland</title>
      <link>https://www.tagesschau.de/inland/sonnenfinsternis-446.html</link>
      <description>Es war ein Naturschauspiel, das hierzulande seit Jahren nicht mehr vorgekommen ist: eine teilweise Sonnenfinsternis. Im Maximum war die Sonne bis zu 90 Prozent vom Mond verdeckt.</description>
      <pubDate>Wed, 12 Aug 2026 20:36:27 +0200</pubDate>
      <dc:date>2026-08-12T18:36:27Z</dc:date>
      <content:encoded><![CDATA[<p><a href="https://www.tagesschau.de/x"><img src="https://images.tagesschau.de/y.jpg" /></a><br/>Es war ein Naturschauspiel. [<a href="https://www.tagesschau.de/x">mehr</a>]</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

// heise: Atom, CDATA titles carrying a type attribute, link as a bare href.
const HEISE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title type="html"><![CDATA[Teilchenphysik: Forscher weisen reines Glueball-Teilchen nach]]></title>
    <id>http://heise.de/-11411637</id>
    <updated>2026-08-12T21:15:00+02:00</updated>
    <published>2026-08-12T21:15:00+02:00</published>
    <link href="https://www.heise.de/news/Teilchenphysik-11411637.html"/>
    <summary type="html"><![CDATA[Nach 50 Jahren Suche gibt es den bislang stärksten Nachweis für ein Glueball – ein Teilchen aus reiner Bindungsenergie der starken Kernkraft.]]></summary>
  </entry>
</feed>`;

// kicker: RSS 2.0 with a guid that is also a URL, and GMT-stamped dates.
const KICKER = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <item>
      <title>2:1 gegen Aston Villa: PSG schafft auch den Supercup-Doppelpack</title>
      <link>https://www.kicker.de/psg-supercup-1242244/artikel#omrss</link>
      <description>Am Mittwochabend stand die erste internationale Titelentscheidung der neuen Spielzeit an.</description>
      <guid isPermaLink="true">https://www.kicker.de/psg-supercup-1242244/artikel#omrss</guid>
      <pubDate>Wed, 12 Aug 2026 20:55:54 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('stripHtml', () => {
  it('removes tags and collapses the whitespace they leave behind', () => {
    expect(stripHtml('<p>Hallo <b>Welt</b></p>')).toBe('Hallo Welt');
  });

  it('turns <br> into a space rather than joining the words either side', () => {
    expect(stripHtml('Zeile eins<br/>Zeile zwei')).toBe('Zeile eins Zeile zwei');
  });

  it('decodes the entities publishers escape', () => {
    expect(stripHtml('Bild &amp; Ton &quot;live&quot;')).toBe('Bild & Ton "live"');
  });

  it('drops the trailing read-on marker', () => {
    expect(stripHtml('Es war ein Naturschauspiel. [mehr]')).toBe('Es war ein Naturschauspiel.');
  });

  it('leaves umlauts and ß untouched', () => {
    expect(stripHtml('<p>Fußball in Köln über Straßen</p>')).toBe('Fußball in Köln über Straßen');
  });
});

describe('parseFeed', () => {
  it('reads an RSS 2.0 item', () => {
    const [item] = parseFeed(TAGESSCHAU);
    expect(item.title).toBe('Millionen verfolgen Sonnenfinsternis über Deutschland');
    expect(item.url).toBe('https://www.tagesschau.de/inland/sonnenfinsternis-446.html');
    expect(item.summary).toContain('Naturschauspiel');
    expect(item.publishedAt.toISOString()).toBe('2026-08-12T18:36:27.000Z');
  });

  it('prefers the description over the full syndicated body', () => {
    const [item] = parseFeed(TAGESSCHAU);
    // content:encoded carries the same prose wrapped in an image and a [mehr]
    // link; the description is already clean, so the body is never reached.
    // Note "nicht mehr" is legitimate prose — only the bracketed marker is not.
    expect(item.summary).not.toContain('img');
    expect(item.summary).not.toContain('[mehr]');
    expect(item.summary).toContain('nicht mehr vorgekommen');
  });

  it('reads an Atom entry, taking the link from its href attribute', () => {
    const [item] = parseFeed(HEISE);
    expect(item.title).toBe('Teilchenphysik: Forscher weisen reines Glueball-Teilchen nach');
    expect(item.url).toBe('https://www.heise.de/news/Teilchenphysik-11411637.html');
    expect(item.summary).toContain('Glueball');
  });

  it('unwraps a CDATA title carrying a type attribute', () => {
    // `<title type="html">` parses to an object, not a string — the shape that
    // silently yields "[object Object]" if textOf is skipped.
    expect(parseFeed(HEISE)[0].title).not.toContain('object');
  });

  it('reads a GMT-stamped RSS date', () => {
    const [item] = parseFeed(KICKER);
    expect(item.publishedAt.toISOString()).toBe('2026-08-12T20:55:54.000Z');
  });

  it('keeps a URL fragment, which is part of the dedup key', () => {
    expect(parseFeed(KICKER)[0].url).toContain('#omrss');
  });

  it('returns an empty array for malformed XML rather than throwing', () => {
    expect(parseFeed('<rss><channel><item>')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('{"not":"xml"}')).toEqual([]);
  });

  it('drops items missing a title, a link or a date', () => {
    const incomplete = `<rss version="2.0"><channel>
      <item><link>https://example.com/a</link><pubDate>Wed, 12 Aug 2026 20:00:00 GMT</pubDate></item>
      <item><title>Kein Link</title><pubDate>Wed, 12 Aug 2026 20:00:00 GMT</pubDate></item>
      <item><title>Kein Datum</title><link>https://example.com/c</link></item>
      <item><title>Vollständig</title><link>https://example.com/d</link><pubDate>Wed, 12 Aug 2026 20:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseFeed(incomplete);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Vollständig');
  });

  it('drops an item whose date cannot be parsed', () => {
    const bogus = `<rss version="2.0"><channel>
      <item><title>T</title><link>https://example.com/a</link><pubDate>irgendwann</pubDate></item>
    </channel></rss>`;
    expect(parseFeed(bogus)).toEqual([]);
  });

  it('handles a channel holding exactly one item, which parses as an object', () => {
    // fast-xml-parser only produces an array when a tag repeats, so a
    // single-item feed is the case that breaks a naive `.map`.
    expect(parseFeed(KICKER)).toHaveLength(1);
  });

  it('picks the alternate link when an Atom entry carries several', () => {
    const multi = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>T</title>
      <published>2026-08-12T21:15:00+02:00</published>
      <link rel="replies" href="https://example.com/comments"/>
      <link rel="alternate" href="https://example.com/article"/>
    </entry></feed>`;
    expect(parseFeed(multi)[0].url).toBe('https://example.com/article');
  });
});
