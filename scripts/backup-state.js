const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const repoRoot = path.join(__dirname, '..');
const stateDir = process.env.STATE_DIR
  ? path.resolve(process.env.STATE_DIR)
  : repoRoot;
const backupDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(stateDir), 'backups');

function usage() {
  console.log(`Usage: npm run backup:state

Environment:
  STATE_DIR    Directory to back up. Defaults to repo root.
  BACKUP_DIR   Directory where backups are written. Defaults to ../backups next to STATE_DIR.
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);

    input.on('error', reject);
    input.on('data', chunk => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  if (!fs.existsSync(stateDir)) {
    fail(`STATE_DIR does not exist: ${stateDir}`);
  }

  if (!fs.statSync(stateDir).isDirectory()) {
    fail(`STATE_DIR is not a directory: ${stateDir}`);
  }

  if (isInside(backupDir, stateDir)) {
    fail(`BACKUP_DIR must not be inside STATE_DIR: ${backupDir}`);
  }

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const archiveName = `whatsapp-scheduler-state-${timestamp()}.tar.gz`;
  const archivePath = path.join(backupDir, archiveName);

  const tar = spawnSync('tar', [
    '--create',
    '--gzip',
    '--file',
    archivePath,
    '--directory',
    stateDir,
    '--exclude=node_modules',
    '--exclude=.git',
    '--exclude=.vscode',
    '--exclude=.idea',
    '--exclude=.wwebjs_cache',
    '--exclude=backups',
    '--exclude=*.tar',
    '--exclude=*.tar.gz',
    '--exclude=*.sha256',
    '--exclude=*.log',
    '--exclude=npm-debug.log*',
    '--exclude=.DS_Store',
    '--exclude=Thumbs.db',
    '.',
  ], {
    stdio: 'inherit',
  });

  if (tar.error) {
    fail(`could not run tar: ${tar.error.message}`);
  }

  if (tar.status !== 0) {
    fail(`tar exited with status ${tar.status}`);
  }

  fs.chmodSync(archivePath, 0o600);

  const digest = await sha256File(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  fs.writeFileSync(checksumPath, `${digest}  ${archiveName}\n`, { mode: 0o600 });

  console.log(`Backup created: ${archivePath}`);
  console.log(`Checksum: ${checksumPath}`);
}

main().catch(error => fail(error.message));
