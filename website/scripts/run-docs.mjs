import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..', '..');
const candidates = process.platform === 'win32'
  ? [resolve(repository, 'backend', '.venv', 'Scripts', 'python.exe'), 'python']
  : [resolve(repository, 'backend', '.venv', 'bin', 'python'), 'python3', 'python'];
const executable = candidates.find((candidate) => !candidate.includes('/') && !candidate.includes('\\') || existsSync(candidate));
if (!executable) throw new Error('Python is required to generate the documentation.');

const result = spawnSync(
  executable,
  [resolve(repository, 'scripts', 'docs', 'generate_docs.py'), ...process.argv.slice(2)],
  { cwd: repository, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
