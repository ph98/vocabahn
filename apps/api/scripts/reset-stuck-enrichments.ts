import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');
  const result = await prisma.dictionaryEntry.updateMany({
    where: {
      enrichmentStatus: 'ENRICHING',
    },
    data: {
      enrichmentStatus: 'PENDING',
    },
  });

  console.log(`Successfully reset ${result.count} stuck "ENRICHING" entries to "PENDING".`);
}

main()
  .catch((err) => {
    console.error('Error resetting entries:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
