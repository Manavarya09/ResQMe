import { API_BASE } from '../config';

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, { timeoutMs = 15000, auth = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && auth && authToken) onUnauthorized?.();
      throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      e.name === 'AbortError' ? 'The ResQMe server took too long to respond.' : 'Cannot reach the ResQMe server.',
      0
    );
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request('GET', '/health', undefined, { auth: false, timeoutMs: 5000 }),
  register: (body) => request('POST', '/api/auth/register', body, { auth: false }),
  login: (body) => request('POST', '/api/auth/login', body, { auth: false }),
  verifyMfa: (body) => request('POST', '/api/auth/mfa/verify', body, { auth: false }),
  mfaSetup: () => request('POST', '/api/auth/mfa/setup'),
  mfaEnable: (code) => request('POST', '/api/auth/mfa/enable', { code }),
  mfaDisable: (code) => request('POST', '/api/auth/mfa/disable', { code }),
  logoutAll: () => request('POST', '/api/auth/logout-all'),
  changePassword: (body) => request('POST', '/api/auth/change-password', body),
  exportData: () => request('GET', '/api/me/export', undefined, { timeoutMs: 30000 }),
  audit: () => request('GET', '/api/me/audit?limit=30'),
  deleteAccount: (password) => request('DELETE', '/api/me', { password }),
  me: () => request('GET', '/api/me'),
  updateMe: (body) => request('PATCH', '/api/me', body),

  getMedical: () => request('GET', '/api/medical-id'),
  saveMedical: (body) => request('PUT', '/api/medical-id', body),
  shareMedical: () => request('POST', '/api/medical-id/share-token'),

  contacts: () => request('GET', '/api/contacts'),
  addContact: (body) => request('POST', '/api/contacts', body),
  updateContact: (id, body) => request('PATCH', `/api/contacts/${id}`, body),
  deleteContact: (id) => request('DELETE', `/api/contacts/${id}`),

  createIncident: (body) => request('POST', '/api/incidents', body, { timeoutMs: 20000 }),
  incidents: () => request('GET', '/api/incidents'),
  incident: (id) => request('GET', `/api/incidents/${id}`),
  sendLocation: (id, body) => request('POST', `/api/incidents/${id}/location`, body),
  cancelIncident: (id) => request('POST', `/api/incidents/${id}/cancel`),
  requestDrone: (id) => request('POST', `/api/incidents/${id}/drone`),
  // responder console
  incidentsQueue: ({ status, limit = 100 } = {}) =>
    request('GET', `/api/incidents?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  ackIncident: (id, etaMinutes) => request('POST', `/api/incidents/${id}/ack`, { etaMinutes }),
  dispatchDrone: (id) => request('POST', `/api/incidents/${id}/drone`),
  resolveIncident: (id) => request('POST', `/api/incidents/${id}/resolve`),

  // live location sharing links (/t/<token>)
  createLocationShare: (body, opts) => request('POST', '/api/location-shares', body, opts),
  locationShares: () => request('GET', '/api/location-shares'),
  pushShareLocation: (id, body) => request('POST', `/api/location-shares/${id}/location`, body),
  stopLocationShare: (id) => request('DELETE', `/api/location-shares/${id}`),

  hazards: ({ lat, lng, radiusKm = 10 }) => request('GET', `/api/hazards?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`),
  reportHazard: (body) => request('POST', '/api/hazards', body),
  drones: () => request('GET', '/api/drones'),

  chat: (body) => request('POST', '/api/chat', body, { timeoutMs: 30000 }),
};
