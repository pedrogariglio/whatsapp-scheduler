'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const repoRoot = path.join(__dirname, '..');
const stateDir = process.env.STATE_DIR
  ? path.resolve(process.env.STATE_DIR)
  : repoRoot;
const stateFile = process.env.HEALTH_STATE_FILE
  ? path.resolve(process.env.HEALTH_STATE_FILE)
  : path.join(stateDir, 'data', 'health-monitor-state.json');
const healthUrl = process.env.HEALTH_URL
  || `http://127.0.0.1:${process.env.PORT || 3001}/internal/health`;
const healthToken = process.env.HEALTH_TOKEN;
const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL;
const failureThreshold = parsePositiveInteger(process.env.HEALTH_FAILURE_THRESHOLD, 2);
const alertCooldownSeconds = parseNonNegativeInteger(process.env.HEALTH_ALERT_COOLDOWN_SECONDS, 900);
const startupGraceSeconds = parseNonNegativeInteger(process.env.HEALTH_STARTUP_GRACE_SECONDS, 180);
const timeoutMs = parsePositiveInteger(process.env.HEALTH_TIMEOUT_MS, 10000);
const alertOnStall = process.env.HEALTH_ALERT_ON_STALL !== 'false';

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function loadState() {
  try {
    if (!fs.existsSync(stateFile)) return {};
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch (err) {
    console.warn(`[health] no se pudo leer el estado previo: ${err.message}`);
    return {};
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`[health] no se pudo guardar el estado: ${err.message}`);
  }
}

async function fetchHealth() {
  const response = await fetch(healthUrl, {
    headers: { 'x-health-token': healthToken },
    signal: AbortSignal.timeout(timeoutMs),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : 'sin detalle';
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('respuesta invalida de /internal/health');
  }

  return payload;
}

async function sendAlert(message, health) {
  console.error(`[health] ALERTA: ${message}`);

  if (!alertWebhookUrl) return;

  try {
    const response = await fetch(alertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'whatsapp-scheduler',
        text: message,
        health,
        timestamp: nowIso(),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error(`[health] el webhook respondio HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[health] no se pudo enviar el webhook: ${err.message}`);
  }
}

async function main() {
  if (!healthToken) {
    console.error('[health] HEALTH_TOKEN no configurado; no se puede consultar /internal/health.');
    process.exit(2);
  }

  const previous = loadState();
  const state = { ...previous, lastCheckAt: nowIso() };
  const reasons = [];
  let health = null;
  let error = null;

  try {
    health = await fetchHealth();
  } catch (err) {
    error = err;
  }

  if (error) {
    state.consecutiveFailures = (previous.consecutiveFailures || 0) + 1;
    state.lastError = error.message;

    if (state.consecutiveFailures >= failureThreshold) {
      reasons.push(
        `sin respuesta de /internal/health (${state.consecutiveFailures} intentos): ${error.message}`
      );
    }
  } else {
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.lastHealth = health;

    const withinStartupGrace = (health.uptimeSeconds || 0) < startupGraceSeconds;

    if (!health.whatsappReady && !withinStartupGrace) {
      state.consecutiveNotReady = (previous.consecutiveNotReady || 0) + 1;
      if (state.consecutiveNotReady >= failureThreshold) {
        reasons.push(
          `WhatsApp no esta ready (${state.consecutiveNotReady} chequeos consecutivos)`
        );
      }
    } else {
      state.consecutiveNotReady = 0;
    }

    if (health.restartRequested) {
      reasons.push('el proceso pidio reinicio');
    }

    const previousStalls = previous.lastReadyTimeoutCount || 0;
    if ((health.readyTimeoutCount || 0) > previousStalls) {
      state.lastReadyTimeoutAt = health.lastReadyTimeoutAt;
      if (alertOnStall) {
        reasons.push(
          `nuevo stall authenticated->ready (#${health.readyTimeoutCount})`
        );
      }
    }
    state.lastReadyTimeoutCount = health.readyTimeoutCount || 0;
  }

  const lastAlertAt = previous.lastAlertAt ? Date.parse(previous.lastAlertAt) : 0;
  const cooldownMs = alertCooldownSeconds * 1000;
  const canAlert = Date.now() - lastAlertAt >= cooldownMs;

  if (reasons.length > 0 && canAlert) {
    state.lastAlertAt = nowIso();
    await sendAlert(reasons.join(' | '), health || { error: state.lastError });
  } else if (reasons.length > 0) {
    console.error(`[health] alerta suprimida por cooldown: ${reasons.join(' | ')}`);
  } else if (health) {
    console.log(
      `[health] OK ready=${health.whatsappReady} uptime=${health.uptimeSeconds}s ` +
      `stalls=${health.readyTimeoutCount || 0}`
    );
  }

  saveState(state);
  process.exit(reasons.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[health] error inesperado:', err.message);
  process.exit(2);
});
