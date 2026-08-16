'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function createNdjsonWriter(logsDir) {
  const streams = new Map();
  const pendingWrites = new Map();

  async function ensureDirectory() {
    await fs.promises.mkdir(logsDir, { recursive: true });
  }

  function getStream(dayKey) {
    let stream = streams.get(dayKey);
    if (!stream || stream.destroyed || stream.writableEnded) {
      stream = fs.createWriteStream(path.join(logsDir, `${dayKey}.ndjson`), {
        flags: 'a',
        encoding: 'utf8'
      });
      stream.on('error', () => {});
      streams.set(dayKey, stream);
    }
    return stream;
  }

  function writeToStream(dayKey, content) {
    return new Promise((resolve, reject) => {
      const stream = getStream(dayKey);
      let settled = false;
      const onError = (error) => finish(error);
      const onDrain = () => finish();
      function finish(error) {
        if (settled) return;
        settled = true;
        stream.removeListener('error', onError);
        stream.removeListener('drain', onDrain);
        if (error) reject(error);
        else resolve();
      }
      stream.once('error', onError);
      try {
        const canContinue = stream.write(String(content || ''), 'utf8');
        if (canContinue) finish();
        else stream.once('drain', onDrain);
      } catch (error) {
        finish(error);
      }
    });
  }

  function append(dayKey, content) {
    const key = String(dayKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return Promise.reject(new Error('invalid-day-key'));
    const previous = pendingWrites.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => writeToStream(key, content));
    pendingWrites.set(key, next);
    return next.finally(() => {
      if (pendingWrites.get(key) === next) pendingWrites.delete(key);
    });
  }

  async function closeAll() {
    const closePromises = [];
    streams.forEach((stream) => {
      closePromises.push(new Promise((resolve) => {
        if (stream.writableEnded || stream.destroyed) {
          resolve();
          return;
        }
        stream.once('close', resolve);
        stream.end();
      }));
    });
    await Promise.all(closePromises);
    streams.clear();
    pendingWrites.clear();
  }

  return { ensureDirectory, append, closeAll };
}

function createLogStore(options) {
  const config = options || {};
  const logsDir = path.resolve(String(config.logsDir || path.join(__dirname, '../database/logs')));
  const retentionDays = Math.max(1, Number(config.retentionDays) || 3);
  const flushIntervalMs = Math.max(200, Number(config.flushIntervalMs) || 1000);
  let writer = createNdjsonWriter(logsDir);
  let queue = [];
  let timer = null;
  let flushing = null;
  let cleanupTimer = null;

  function dayKey(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  function retentionDayKeys() {
    const keys = [];
    const now = new Date();
    for (let index = 0; index < retentionDays; index += 1) {
      const date = new Date(now);
      date.setUTCDate(now.getUTCDate() - index);
      keys.push(date.toISOString().slice(0, 10));
    }
    return keys;
  }

  function normalizeLog(item, index) {
    const source = item && typeof item === 'object' ? item : {};
    const sourceTimestamp = new Date(source.timestamp || Date.now());
    const timestamp = Number.isNaN(sourceTimestamp.getTime()) ? new Date().toISOString() : sourceTimestamp.toISOString();
    const id = source.id === undefined || source.id === null || source.id === '' ? `${Date.now()}-${index || 0}` : source.id;
    return Object.assign({}, source, { id, timestamp });
  }

  async function cleanupOldFiles() {
    await fs.promises.mkdir(logsDir, { recursive: true });
    const keep = new Set(retentionDayKeys());
    const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });
    const remove = entries
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.ndjson$/i.test(entry.name))
      .filter((entry) => !keep.has(entry.name.replace(/\.ndjson$/i, '')))
      .map((entry) => fs.promises.unlink(path.join(logsDir, entry.name)).catch(() => {}));
    await Promise.all(remove);
  }

  function scheduleFlush(delay) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, Math.max(0, delay === undefined ? flushIntervalMs : delay));
  }

  async function flush() {
    if (flushing) return flushing;
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    flushing = (async () => {
      await writer.ensureDirectory();
      const grouped = new Map();
      batch.forEach((item) => {
        const key = dayKey(item.timestamp);
        const content = `${JSON.stringify(item)}\n`;
        grouped.set(key, `${grouped.get(key) || ''}${content}`);
      });
      const entries = Array.from(grouped.entries());
      for (let index = 0; index < entries.length; index += 1) {
        await writer.append(entries[index][0], entries[index][1]);
      }
      await cleanupOldFiles();
    })();
    try {
      await flushing;
    } catch (error) {
      queue = batch.concat(queue);
      throw error;
    } finally {
      flushing = null;
      if (queue.length) scheduleFlush(0);
    }
  }

  function queueLogs(items) {
    const source = Array.isArray(items) ? items : [items];
    const normalized = source.filter(Boolean).map((item, index) => normalizeLog(item, index));
    queue = queue.concat(normalized);
    if (queue.length >= 50) scheduleFlush(0);
    else if (queue.length) scheduleFlush(flushIntervalMs);
    return normalized;
  }

  async function readDay(day, filters) {
    const result = [];
    const filePath = path.join(logsDir, `${day}.ndjson`);
    let input;
    try { input = fs.createReadStream(filePath, { encoding: 'utf8' }); } catch (error) { return result; }
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const raw = String(line || '').trim();
        if (!raw) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
        if (!parsed || typeof parsed !== 'object') continue;
        const user = String(parsed.browserUser || parsed.windowsUser || parsed.user || parsed.user_id || '').toLowerCase();
        const action = String(parsed.action || parsed.type || '').toLowerCase();
        const details = parsed.details && typeof parsed.details === 'object' ? parsed.details : {};
        const payload = JSON.stringify(parsed).toLowerCase();
        const query = String(filters.q || '').toLowerCase();
        if (filters.type && action !== filters.type) continue;
        if (filters.user && user.indexOf(filters.user) < 0) continue;
        if (query && payload.indexOf(query) < 0) continue;
        result.push(parsed);
        if (result.length > filters.limit) result.shift();
      }
    } finally {
      input.destroy();
    }
    return result.reverse();
  }

  async function readLogs(filters) {
    const source = filters || {};
    const normalized = {
      limit: Math.max(1, Math.min(5000, Number(source.limit) || 200)),
      q: String(source.q || '').trim(),
      type: String(source.type || '').trim().toLowerCase(),
      user: String(source.user || '').trim().toLowerCase()
    };
    const requestedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(source.day || '')) ? String(source.day) : '';
    const days = requestedDay ? [requestedDay] : retentionDayKeys();
    const rows = [];
    for (let index = 0; index < days.length && rows.length < normalized.limit; index += 1) {
      const dayRows = await readDay(days[index], Object.assign({}, normalized, { limit: normalized.limit - rows.length }));
      rows.push.apply(rows, dayRows);
    }
    return rows.slice(0, normalized.limit);
  }

  async function replaceLogs(items) {
    await flush();
    await writer.closeAll();
    writer = createNdjsonWriter(logsDir);
    await fs.promises.mkdir(logsDir, { recursive: true });
    const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isFile() && /\.ndjson$/i.test(entry.name)).map((entry) => fs.promises.unlink(path.join(logsDir, entry.name)).catch(() => {})));
    queueLogs(items || []);
    await flush();
    await cleanupOldFiles();
  }

  async function initialize() {
    await writer.ensureDirectory();
    await cleanupOldFiles();
    cleanupTimer = setInterval(() => cleanupOldFiles().catch(() => {}), 60 * 60 * 1000);
    cleanupTimer.unref();
  }

  async function close() {
    if (timer) clearTimeout(timer);
    if (cleanupTimer) clearInterval(cleanupTimer);
    await flush();
    await writer.closeAll();
  }

  return { logsDir, initialize, queueLogs, flush, readLogs, replaceLogs, cleanupOldFiles, close };
}

module.exports = { createNdjsonWriter, createLogStore };
