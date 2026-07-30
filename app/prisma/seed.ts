/** CLI wrapper. The real logic lives in src/lib/seed.ts so the server can also
 *  run it on first boot without needing shell access to the container. */
import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/lib/seed';

const prisma = new PrismaClient();

runSeed(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
