import { migrate } from '../db/migrate';
import { pool } from '../db/pool';
import { ensureSenders, listSenders } from '../services/senders';
import { config } from '../config';

/** Creates Ethereal sender accounts and prints their login so they can be opened at ethereal.email. */
async function main() {
  await migrate();
  const created = await ensureSenders(config.ETHEREAL_ACCOUNTS);
  const all = await listSenders();
  console.log(`${created} new sender(s) created, ${all.length} total:`);
  for (const s of all) console.log(`  ${s.email}  (password: ${s.smtp_pass})`);
  console.log('Log in at https://ethereal.email/login with any of these to see captured mail.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
