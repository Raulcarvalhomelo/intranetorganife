'use strict';

const fs = require('fs');
const path = require('path');

function createNdjsonWriter(logsDir) {
  const streams = new Map();
  async function ensureDirectory() { await fs.promises.mkdir(logsDir, { recursive: true }); }
  function getStream(dayKey) {
    let stream = streams.get(dayKey);
    if (!stream || stream.destroyed) {
      stream = fs.createWriteStream(path.join(logsDir, `${dayKey}.ndjson`), { flags: 'a', encoding: 'utf8' });
      streams.set(dayKey, stream);
    }
    return stream;
  }
  function append(dayKey, content) {
    return new Promise((resolve, reject) => {
      const stream = getStream(dayKey);
      const onError = (error) => { stream.removeListener('drain', onDrain); reject(error); };
      const onDrain = () => { stream.removeListener('error', onError); resolve(); };
      stream.once('error', onError);
      if (stream.write(content, 'utf8')) {
        stream.removeListener('error', onError);
        resolve();
      } else {
        stream.once('drain', onDrain);
      }
    });
  }
  function closeAll() {
    streams.forEach((stream) => stream.end());
    streams.clear();
  }
  return { ensureDirectory, append, closeAll };
}

module.exports = { createNdjsonWriter };
