import { WebSocketServer } from 'ws';

// Map of ws client -> { user, imageId, cursor }
const clients = new Map();

// Throttle tracking for cursor broadcasts
const cursorTimers = new Map();
const CURSOR_THROTTLE_MS = 50;

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Extract user identity from headers or query
    const user = req.headers['tailscale-user-login']
      || req.headers['x-webauth-user']
      || 'local-user';

    clients.set(ws, { user, imageId: null, cursor: null });

    // Send current presence to newly connected client
    ws.send(JSON.stringify({
      type: 'presence',
      users: getPresenceList(),
    }));

    // Broadcast updated presence to everyone
    broadcastAll({
      type: 'presence',
      users: getPresenceList(),
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const client = clients.get(ws);
      if (!client) return;

      switch (msg.type) {
        case 'cursor': {
          client.cursor = { x: msg.x, y: msg.y };
          // Throttled broadcast of cursor position
          if (!cursorTimers.has(ws)) {
            cursorTimers.set(ws, setTimeout(() => {
              cursorTimers.delete(ws);
              if (client.imageId) {
                broadcastToImage(client.imageId, {
                  type: 'cursor',
                  user: client.user,
                  x: client.cursor?.x,
                  y: client.cursor?.y,
                }, ws);
              }
            }, CURSOR_THROTTLE_MS));
          }
          break;
        }

        case 'subscribe-image': {
          client.imageId = msg.imageId;
          broadcastAll({
            type: 'presence',
            users: getPresenceList(),
          });
          break;
        }
      }
    });

    ws.on('close', () => {
      const timer = cursorTimers.get(ws);
      if (timer) clearTimeout(timer);
      cursorTimers.delete(ws);
      clients.delete(ws);

      broadcastAll({
        type: 'presence',
        users: getPresenceList(),
      });
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  return wss;
}

function getPresenceList() {
  const users = [];
  for (const [, info] of clients) {
    users.push({
      user: info.user,
      imageId: info.imageId,
    });
  }
  return users;
}

/**
 * Broadcast a message to all clients subscribed to a specific image.
 */
export function broadcastToImage(imageId, message, excludeWs = null) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws, info] of clients) {
    if (ws !== excludeWs && info.imageId === imageId && ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

/**
 * Broadcast a message to all connected clients.
 */
export function broadcastAll(message, excludeWs = null) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(payload);
    }
  }
}
