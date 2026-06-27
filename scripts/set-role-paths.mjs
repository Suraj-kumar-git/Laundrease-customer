// scripts/set-role-paths.js
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import "dotenv/config";

const ROLE = process.env.ROLE;

if (!ROLE) {
  console.error('Error: ROLE environment variable is not set.');
  process.exit(1);
}

const validRoles = ['customer','delivery','laundry','admin','support'];
if (!validRoles.includes(ROLE)) {
  console.error(`Error: ROLE "${ROLE}" is not valid. Expected one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');

let tsconfig;
try {
  tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
} catch (err) {
  console.error(`Error reading tsconfig.json at ${tsconfigPath}:`, err);
  process.exit(1);
}

tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};
tsconfig.exclude = tsconfig.exclude || [];

// Update the app alias to point to the selected role folder
const roleFolder = ROLE;
tsconfig.compilerOptions.paths['@/app/*'] = [`app/${roleFolder}/*`];

// Write back
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');
console.log(`Updated tsconfig.json paths: "@/app/*" -> "app/${roleFolder}/*"`);