/**
 * Seed six quality themed courses so new users have a rich starting point.
 *
 *   pnpm --filter @vocabahn/api seed:decks
 *
 * Requires the lexicon to be ingested and seed:dictionary to have run first.
 * Each deck uses a curated word list; words not yet in DictionaryEntry are
 * skipped gracefully (they appear after enrichment catches up).
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DeckSpec {
  slug: string;
  title: string;
  description: string;
  cefrLevel: string;
  order: number;
  words: string[];
}

const DECKS: DeckSpec[] = [

  {
    slug: 'begruessungen-basics',
    title: 'Begrüßungen & Basics',
    description: 'Greetings, politeness, and the very first words you need to survive in German.',
    cefrLevel: 'A1',
    order: 1,
    words: [
      'hallo', 'tschüss', 'guten Morgen', 'guten Tag', 'guten Abend', 'gute Nacht',
      'bitte', 'danke', 'ja', 'nein', 'vielleicht', 'natürlich', 'genau',
      'Entschuldigung', 'Verzeihung', 'Hilfe',
      'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
      'sein', 'haben', 'heißen', 'kommen', 'gehen', 'sprechen', 'verstehen',
      'Deutsch', 'Englisch', 'die Sprache', 'die Frage', 'die Antwort',
      'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'wie viel',
      'gut', 'schlecht', 'schön', 'neu', 'alt', 'groß', 'klein',
      'das Wort', 'der Name', 'die Person', 'der Mensch', 'die Familie',
      'der Mann', 'die Frau', 'das Kind', 'der Freund', 'die Freundin',
    ],
  },

  {
    slug: 'zahlen-uhrzeit',
    title: 'Zahlen & Uhrzeit',
    description: 'Numbers, telling the time, days of the week, and months — the backbone of everyday conversation.',
    cefrLevel: 'A1',
    order: 2,
    words: [
      'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
      'elf', 'zwölf', 'zwanzig', 'dreißig', 'hundert', 'tausend',
      'die Uhr', 'die Stunde', 'die Minute', 'die Sekunde',
      'der Morgen', 'der Mittag', 'der Nachmittag', 'der Abend', 'die Nacht',
      'heute', 'gestern', 'morgen', 'übermorgen',
      'der Montag', 'der Dienstag', 'der Mittwoch', 'der Donnerstag',
      'der Freitag', 'der Samstag', 'der Sonntag',
      'die Woche', 'der Monat', 'das Jahr', 'das Datum',
      'der Januar', 'der Februar', 'der März', 'der April', 'der Mai', 'der Juni',
      'der Juli', 'der August', 'der September', 'der Oktober', 'der November', 'der Dezember',
      'früh', 'spät', 'pünktlich', 'immer', 'manchmal', 'nie',
    ],
  },

  {
    slug: 'unterwegs',
    title: 'Unterwegs',
    description: 'Getting around — public transport, directions, accommodation, and travel vocabulary.',
    cefrLevel: 'A2',
    order: 3,
    words: [
      'der Zug', 'die U-Bahn', 'der Bus', 'die Straßenbahn', 'das Taxi', 'das Flugzeug',
      'das Fahrrad', 'das Auto', 'das Schiff',
      'der Bahnhof', 'der Flughafen', 'die Haltestelle', 'das Gleis', 'der Ausgang',
      'das Hotel', 'das Zimmer', 'der Schlüssel', 'die Rezeption', 'das Gepäck',
      'die Straße', 'der Weg', 'die Brücke', 'der Platz', 'die Kreuzung',
      'links', 'rechts', 'geradeaus', 'neben', 'gegenüber', 'zwischen',
      'fahren', 'fliegen', 'ankommen', 'abfahren', 'umsteigen', 'warten',
      'das Ticket', 'die Fahrkarte', 'der Fahrplan', 'die Verspätung',
      'weit', 'nah', 'nächste', 'letzte', 'direkt',
      'die Karte', 'die Adresse', 'die Stadt', 'das Land', 'die Grenze',
    ],
  },

  {
    slug: 'essen-trinken',
    title: 'Essen & Trinken',
    description: 'Food, drinks, ordering at a restaurant, and German cuisine staples.',
    cefrLevel: 'A2',
    order: 4,
    words: [
      'das Essen', 'das Trinken', 'das Frühstück', 'das Mittagessen', 'das Abendessen',
      'das Restaurant', 'das Café', 'die Kneipe', 'die Speisekarte', 'die Rechnung',
      'das Brot', 'die Butter', 'der Käse', 'das Fleisch', 'der Fisch',
      'das Gemüse', 'das Obst', 'der Salat', 'die Suppe', 'der Kuchen',
      'das Wasser', 'der Saft', 'der Kaffee', 'der Tee', 'das Bier', 'der Wein',
      'das Glas', 'die Tasse', 'der Teller', 'die Gabel', 'das Messer', 'der Löffel',
      'essen', 'trinken', 'kochen', 'bestellen', 'bezahlen', 'schmecken',
      'lecker', 'satt', 'hungrig', 'durstig', 'vegetarisch',
      'die Portion', 'der Nachtisch', 'das Gericht', 'die Zutaten',
      'scharf', 'süß', 'sauer', 'salzig', 'bitter',
    ],
  },

  {
    slug: 'arbeit-alltag',
    title: 'Arbeit & Alltag',
    description: 'Work, home, shopping, and the language of everyday German life.',
    cefrLevel: 'B1',
    order: 5,
    words: [
      'die Arbeit', 'der Job', 'der Beruf', 'der Chef', 'der Kollege', 'die Kollegin',
      'das Büro', 'das Unternehmen', 'die Firma', 'das Meeting', 'das Gehalt',
      'arbeiten', 'verdienen', 'kündigen', 'bewerben', 'einstellen',
      'die Wohnung', 'das Haus', 'das Zimmer', 'die Küche', 'das Bad',
      'der Supermarkt', 'das Einkaufen', 'der Preis', 'das Angebot', 'die Kasse',
      'kaufen', 'verkaufen', 'bezahlen', 'kosten', 'sparen',
      'der Termin', 'die Besprechung', 'der Urlaub', 'die Freizeit',
      'das Geld', 'die Bank', 'das Konto', 'die Überweisung',
      'der Computer', 'das Handy', 'die E-Mail', 'das Internet',
      'müde', 'gestresst', 'beschäftigt', 'erfolgreich', 'zufrieden',
      'das Problem', 'die Lösung', 'der Fehler', 'die Verbesserung',
    ],
  },
];

async function seedDeck(spec: DeckSpec, topEntries: Array<{ id: string }>) {
  let wordIds: string[];

  // Look up entries by word string; skip any not yet in the dictionary.
  const found = await prisma.dictionaryEntry.findMany({
      where: { word: { in: spec.words } },
      select: { id: true, word: true },
    });
    const foundMap = new Map(found.map((e) => [e.word, e.id]));
    wordIds = spec.words
      .map((w) => foundMap.get(w))
      .filter((id): id is string => id !== undefined);
  const missing = spec.words.length - wordIds.length;
  if (missing > 0) console.log(`  ${missing} words not yet in dictionary (will be added as enrichment runs)`);

  const course = await prisma.course.upsert({
    where: { slug: spec.slug },
    create: {
      slug: spec.slug,
      title: spec.title,
      description: spec.description,
      cefrLevel: spec.cefrLevel,
      order: spec.order,
      published: true,
    },
    update: { title: spec.title, description: spec.description, order: spec.order },
  });

  const { count } = await prisma.courseWord.createMany({
    data: wordIds.map((id, i) => ({ courseId: course.id, dictionaryEntryId: id, order: i })),
    skipDuplicates: true,
  });

  console.log(`  ✓ "${course.title}" — ${count} words added (${wordIds.length} total)`);
}

async function main() {
  console.log('Seeding themed decks...\n');

  // We no longer pre-fetch frequency entries.

  for (const deck of DECKS) {
    process.stdout.write(`Seeding ${deck.title}...\n`);
    await seedDeck(deck, []);
  }

  console.log('\nDone! All decks seeded.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
