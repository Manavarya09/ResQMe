import { io } from 'socket.io-client';
import { API_BASE } from '../config';

let socket = null;
// Listeners live here rather than on a socket instance, so a screen can subscribe before the
// socket exists (it is created right after sign-in) and keep receiving events across reconnects
// with a new token (password change, sign-out-everywhere).
const handlers = new Map(); // event -> Set<fn>

function attachAll(s) {
  handlers.forEach((fns, event) => fns.forEach((fn) => s.on(event, fn)));
}

export function connectSocket(token) {
  disconnectSocket();
  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  attachAll(socket);
  return socket;
}

export function getSocket() {
  return socket;
}

/** Subscribe to a server event on the current and any future socket. Returns an unsubscribe fn. */
export function onSocketEvent(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  socket?.on(event, fn);
  return () => {
    handlers.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
