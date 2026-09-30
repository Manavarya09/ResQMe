import { io } from 'socket.io-client';
import { API_BASE } from '../config';

let socket = null;

export function connectSocket(token) {
  disconnectSocket();
  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
