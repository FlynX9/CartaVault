import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..', '..');
const candidates = process.platform === 'win32'
  ? [resolve(repository, 'backend', '.venv', 'Scripts', 'python.exe'), 'python']
  : [resolve(repository, 'backend', '.venv', 'bin', 'python'), 'python3', 'python'];
const executable = candidates.find((candidate) => !candidate.includes('/') && !candidate.includes('\\') || existsSync(candidate));
if (!executable) throw new Error('Python is required.');

const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error('A Python script path is required.');
const result = spawnSync(executable, [resolve(repository, script), ...args], { cwd: repository, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
