import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);
  const store = useStore();

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'cursor':
            store.setCursor(msg.user, msg.position);
            break;
          case 'annotation-created':
            store.addAnnotation(msg.annotation);
            break;
          case 'annotation-updated':
            store.updateAnnotation(msg.annotation.id, msg.annotation);
            break;
          case 'annotation-deleted':
            store.removeAnnotation(msg.annotationId);
            break;
          case 'presence':
            store.setConnectedUsers(msg.users);
            break;
        }
      };

      ws.onclose = () => {
        // Reconnect after 2s if component is still mounted
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, 2000);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendCursor = useCallback((position) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cursor', position }));
    }
  }, []);

  const subscribeToImage = useCallback((imageId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', imageId }));
    }
  }, []);

  return { sendCursor, subscribeToImage };
}
