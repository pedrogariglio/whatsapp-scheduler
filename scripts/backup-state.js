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
const backupPrefix = 'whatsapp-scheduler-state-';
const backupSuffix = '.tar.gz';
const retentionDays = parseNonNegativeInteger(
  process.env.BACKUP_RETENTION_DAYS,
  30,
  'BACKUP_RETENTION_DAYS',
);
const retentionMinCount = parseNonNegativeInteger(
  process.env.BACKUP_RETENTION_MIN_COUNT,
  7,
  'BACKUP_RETENTION_MIN_COUNT',
);
const pauseContainer = process.env.BACKUP_PAUSE_CONTAINER || '';

function usage() {
  console.log(`Usage: npm run backup:state

Environment:
  STATE_DIR    Directory to back up. Defaults to repo root.
  BACKUP_DIR   Directory where backups are written. Defaults to ../backups next to STATE_DIR.
  BACKUP_RETENTION_DAYS       Delete backups older than this many days. Defaults to 30. Use 0 to disable age pruning.
  BACKUP_RETENTION_MIN_COUNT  Always keep at least this many newest backups. Defaults to 7.
  BACKUP_PAUSE_CONTAINER      Optional Docker container to pause during the snapshot for consistency.
`);
}


function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    timeout: 30000,
    ...options,
  });
}

function pauseContainerIfRunning(name) {
  if (!name) return false;

  const inspect = runDocker(['inspect', '-f', '{{.State.Running}}', name], {
    encoding: 'utf8',
  });

  if (inspect.error || inspect.status !== 0) {
    console.warn(`Backup: no se pudo inspeccionar el contenedor ${name}; se continua sin pausa.`);
    return false;
  }

  if (String(inspect.stdout || '').trim() !== 'true') {
    console.log(`Backup: el contenedor ${name} no esta corriendo; no se pausa.`);
    return false;
  }

  const pause = runDocker(['pause', name], { stdio: 'inherit' });
  if (pause.error || pause.status !== 0) {
    console.warn(`Backup: no se pudo pausar ${name}; se continua sin pausa.`);
    return false;
  }

  console.log(`Backup: contenedor ${name} pausado para snapshot consistente.`);
  return true;
}

function unpauseContainerIfNeeded(name, wasPaused) {
  if (!wasPaused) return;

  const unpause = runDocker(['unpause', name], { stdio: 'inherit' });
  if (unpause.error || unpause.status !== 0) {
    console.error(`Backup: no se pudo reanudar el contenedor ${name}. Revisar manualmente.`);
    return;
  }

  console.log(`Backup: contenedor ${name} reanudado.`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function parseNonNegativeInteger(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function listBackups() {
  return fs.readdirSync(backupDir)
    .filter(fileName => fileName.startsWith(backupPrefix) && fileName.endsWith(backupSuffix))
    .map(fileName => {
      const archivePath = path.join(backupDir, fileName);
      const stat = fs.statSync(archivePath);

      return {
        fileName,
        archivePath,
        checksumPath: `${archivePath}.sha256`,
        isFile: stat.isFile(),
        mtimeMs: stat.mtimeMs,
      };
    })
    .filter(backup => backup.isFile)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneOldBackups() {
  if (retentionDays === 0) {
    console.log('Backup retention: age pruning disabled');
    return;
  }

  const cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const backups = listBackups();
  const removable = backups
    .slice(retentionMinCount)
    .filter(backup => backup.mtimeMs < cutoffMs);

  if (removable.length === 0) {
    console.log(`Backup retention: no old backups to delete (days=${retentionDays}, min=${retentionMinCount})`);
    return;
  }

  for (const backup of removable) {
    fs.rmSync(backup.archivePath, { force: true });
    fs.rmSync(backup.checksumPath, { force: true });
    console.log(`Backup retention: deleted ${backup.fileName}`);
  }
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

  const archiveName = `${backupPrefix}${timestamp()}${backupSuffix}`;
  const archivePath = path.join(backupDir, archiveName);

  let paused = false;
  try {
    paused = pauseContainerIfRunning(pauseContainer);

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
      '--exclude=.wwebjs_auth.bak-*',
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
      fs.rmSync(archivePath, { force: true });
      throw new Error(`could not run tar: ${tar.error.message}`);
    }

    if (tar.status !== 0) {
      fs.rmSync(archivePath, { force: true });
      throw new Error(`tar exited with status ${tar.status}; se elimino el archivo parcial`);
    }
  } finally {
    unpauseContainerIfNeeded(pauseContainer, paused);
  }

  fs.chmodSync(archivePath, 0o600);

  const digest = await sha256File(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  fs.writeFileSync(checksumPath, `${digest}  ${archiveName}\n`, { mode: 0o600 });

  console.log(`Backup created: ${archivePath}`);
  console.log(`Checksum: ${checksumPath}`);

  pruneOldBackups();
}

main().catch(error => fail(error.message));
