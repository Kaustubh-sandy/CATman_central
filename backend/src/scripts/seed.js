// Seeds machines and operators into Firestore (or memory if Firestore isn't configured).
// Usage: npm run seed            — only creates missing docs
//        npm run seed -- --force — overwrites machines and operators with the JSON seed data
const repo = require('../db/repo');
const { ensureSeeded } = require('../db/seed');

const WAIT_FOR_WRITES_MS = 250;

async function run() {
  const force = process.argv.includes('--force');
  const status = await repo.init();
  console.log(`Storage: ${status.firestore ? 'Firestore' : 'memory only (no Firebase config)'}`);

  const created = ensureSeeded({ force });
  console.log(created.length ? `Seeded ${created.length} docs.` : 'Nothing to seed — all docs already exist.');

  while (repo.getStatus().pendingWrites > 0) {
    await new Promise((r) => setTimeout(r, WAIT_FOR_WRITES_MS));
  }
  const { lastWriteError } = repo.getStatus();
  if (lastWriteError) {
    console.error('Some writes failed:', lastWriteError);
    process.exit(1);
  }
  process.exit(0);
}

run();
