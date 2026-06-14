/**
 * Create a demo published course (PRD §4.3) from the top-N dictionary entries
 * by frequency, so the review flow can be exercised without manual AdminJS
 * data entry. AdminJS remains the real course-authoring tool.
 *
 *   pnpm --filter @vocabahn/api seed:course [-- --top 100]
 *
 * Idempotent: re-running upserts the course and skips existing CourseWords.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'grundwortschatz-1';

async function main() {
  const topArg = process.argv.indexOf('--top');
  const top = topArg === -1 ? 100 : Number(process.argv[topArg + 1]);

  const entries = await prisma.dictionaryEntry.findMany({
    select: { id: true, lexiconEntry: { select: { frequencyRank: true } } },
    orderBy: { lexiconEntry: { frequencyRank: 'asc' } },
    take: top,
  });
  console.log(`selected ${entries.length} entries for course "${SLUG}"`);

  const course = await prisma.course.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      title: 'Grundwortschatz 1',
      description: 'The most frequent German words — a first foundation.',
      cefrLevel: 'A1',
      order: 0,
      published: true,
    },
    update: {},
  });

  const { count } = await prisma.courseWord.createMany({
    data: entries.map((e, i) => ({ courseId: course.id, dictionaryEntryId: e.id, order: i })),
    skipDuplicates: true,
  });

  console.log(`done: ${count} course words created (course "${course.slug}")`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
