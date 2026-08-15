'use strict';

const WebSocket = require('ws');

function createRealtimeServer(httpServer, handlers) {
  const options = handlers || {};
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  const clients = new Set();

  function send(client, message) {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify(message));
  }

  function broadcast(message, room) {
    clients.forEach((client) => {
      if (!room || client.room === room) send(client, message);
    });
  }

  wss.on('connection', (socket, request) => {
    socket.isAlive = true;
    socket.room = 'unknown';
    clients.add(socket);
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch (error) { return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'hello') {
        socket.room = message.client === 'dashboard' ? 'dashboard' : 'extension';
        send(socket, { type: 'hello_ack', room: socket.room, at: new Date().toISOString() });
        if (typeof options.onHello === 'function') options.onHello(socket, message, request);
        return;
      }
      if (typeof options.onMessage === 'function') options.onMessage(socket, message, request);
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    send(socket, { type: 'hello_required' });
  });

  const heartbeat = setInterval(() => {
    clients.forEach((socket) => {
      if (socket.isAlive === false) {
        clients.delete(socket);
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
      return null;
    });
  }, 30000);
  heartbeat.unref();

  return {
    broadcast,
    send,
    clients,
    close: () => { clearInterval(heartbeat); wss.close(); }
  };
}

module.exports = { createRealtimeServer };
