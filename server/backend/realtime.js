'use strict';

const WebSocket = require('ws');

const CLIENT_ROOMS = Object.freeze({
  extension: 'extension',
  dashboard: 'dashboard'
});

function createRealtimeServer(httpServer, handlers) {
  const options = handlers || {};
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  const clients = new Set();
  const heartbeatIntervalMs = Math.max(5000, Number(options.heartbeatIntervalMs) || 30000);

  function send(client, message) {
    if (!client || client.readyState !== WebSocket.OPEN) return false;
    try {
      client.send(JSON.stringify(message));
      return true;
    } catch (error) {
      return false;
    }
  }

  function broadcast(message, room) {
    let count = 0;
    clients.forEach((client) => {
      if (!room || client.room === room) {
        if (send(client, message)) count += 1;
      }
    });
    return count;
  }

  function broadcastToRoom(room, message) {
    return broadcast(message, room);
  }

  function removeClient(socket) {
    clients.delete(socket);
    if (typeof options.onClose === 'function') options.onClose(socket);
  }

  function resolveRoom(value) {
    const client = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(CLIENT_ROOMS, client) ? CLIENT_ROOMS[client] : '';
  }

  wss.on('connection', (socket, request) => {
    socket.isAlive = true;
    socket.room = '';
    socket.clientType = '';
    socket.authenticated = false;
    clients.add(socket);
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch (error) {
        send(socket, { type: 'error', code: 'invalid-json' });
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'hello') {
        const room = resolveRoom(message.client);
        if (!room) {
          send(socket, { type: 'error', code: 'invalid-client' });
          socket.close(1008, 'invalid-client');
          return;
        }
        socket.room = room;
        socket.clientType = room;
        socket.authenticated = typeof options.authenticate === 'function'
          ? Boolean(options.authenticate(socket, message, request))
          : true;
        if (!socket.authenticated) {
          send(socket, { type: 'error', code: 'unauthorized' });
          socket.close(1008, 'unauthorized');
          return;
        }
        send(socket, {
          type: 'hello_ack',
          room,
          authenticated: true,
          at: new Date().toISOString()
        });
        if (typeof options.onHello === 'function') options.onHello(socket, message, request);
        return;
      }
      if (!socket.authenticated || !socket.room) {
        send(socket, { type: 'error', code: 'hello-required' });
        return;
      }
      if (message.type === 'ping') {
        send(socket, { type: 'pong', at: new Date().toISOString() });
        return;
      }
      if (typeof options.onMessage === 'function') options.onMessage(socket, message, request);
    });
    socket.on('close', () => removeClient(socket));
    socket.on('error', () => removeClient(socket));
    send(socket, { type: 'hello_required' });
  });

  const heartbeat = setInterval(() => {
    clients.forEach((socket) => {
      if (socket.isAlive === false) {
        removeClient(socket);
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      try {
        socket.ping();
      } catch (error) {
        removeClient(socket);
      }
    });
  }, heartbeatIntervalMs);
  heartbeat.unref();

  return {
    broadcast,
    broadcastToRoom,
    send,
    clients,
    close: () => {
      clearInterval(heartbeat);
      clients.forEach((socket) => socket.close());
      wss.close();
    }
  };
}

module.exports = { createRealtimeServer, CLIENT_ROOMS };
