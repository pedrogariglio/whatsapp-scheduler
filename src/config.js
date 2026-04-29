const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const repoRoot = path.join(__dirname, '..');
const stateDir = process.env.STATE_DIR
  ? path.resolve(process.env.STATE_DIR)
  : repoRoot;
const configPath = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.join(stateDir, 'config.json');

function ensureStateDir() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
}

function getDefaultConfig() {
  return {
    firstRun: true,
    auth: {
      username: '',
      passwordHash: '',
    },
  };
}

function ensureConfig() {
  ensureStateDir();

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(getDefaultConfig(), null, 2), { mode: 0o600 });
    return getDefaultConfig();
  }

  const config = getConfig();
  let needsSave = false;

  if (!config.auth) {
    config.auth = { username: '', passwordHash: '' };
    needsSave = true;
  }

  // Migrate legacy plaintext password on disk the next time we can.
  if (config.auth.password && !config.auth.passwordHash) {
    config.auth.passwordHash = hashPassword(config.auth.password);
    delete config.auth.password;
    needsSave = true;
  }

  if (typeof config.firstRun !== 'boolean') {
    config.firstRun = !config.auth.username || !config.auth.passwordHash;
    needsSave = true;
  }

  if (needsSave) {
    saveConfig(config);
  }

  return config;
}

function getConfig() {
  ensureStateDir();
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveConfig(config) {
  ensureStateDir();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function hasConfiguredAdmin(config = getConfig()) {
  return Boolean(config.auth && config.auth.username && config.auth.passwordHash);
}

module.exports = {
  configPath,
  stateDir,
  ensureConfig,
  getConfig,
  saveConfig,
  hasConfiguredAdmin,
};
