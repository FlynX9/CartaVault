import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deploymentMode = process.argv[2] ?? 'preprod';
const outputDirectory = process.argv[3] ?? (deploymentMode === 'public' ? 'dist-release' : 'dist-prod');
if (!['preprod', 'public'].includes(deploymentMode)) throw new Error(`Unknown deployment mode: ${deploymentMode}`);

const root = fileURLToPath(new URL('../', import.meta.url));
const astro = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const environment = { ...process.env, PUBLIC_SITE_INDEXABLE: deploymentMode === 'public' ? 'true' : 'false' };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [astro, 'build', '--outDir', outputDirectory]);
run(process.execPath, ['scripts/prepare-production.mjs', outputDirectory, deploymentMode]);
run(process.execPath, ['scripts/check-site.mjs', outputDirectory, deploymentMode]);
