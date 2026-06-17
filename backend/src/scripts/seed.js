/**
 * Seed super-admin + default plans in one command.
 * Usage:
 *   node src/scripts/seed.js
 *   node src/scripts/seed.js "Akshay" admin@mailbox.io "ChangeMe123!"
 *
 * Env fallbacks: SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminArgs = process.argv.slice(2);

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, scriptName), ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('=== Seeding super admin ===');
  await runScript('seedSuperAdmin.js', adminArgs);
  console.log('\n=== Seeding plans ===');
  await runScript('seedPlans.js');
  console.log('\nAll seeds complete.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
