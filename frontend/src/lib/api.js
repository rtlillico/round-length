// round-length/frontend/src/lib/api.js
// Thin wrapper around fetch for all backend API calls.

const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── FARMS ────────────────────────────────────────────────────────────────────

export const api = {
  farms: {
    list:   ()           => request('GET',   '/farms'),
    get:    (id)         => request('GET',   `/farms/${id}`),
    create: (data)       => request('POST',  '/farms', data),
    update: (id, data)   => request('PATCH', `/farms/${id}`, data),
    status: (id)         => request('GET',   `/farms/${id}/status`),
  },

  scenarios: {
    list:   (farmId)     => request('GET',    `/scenarios?farmId=${farmId}`),
    get:    (id)         => request('GET',    `/scenarios/${id}`),
    create: (data)       => request('POST',   '/scenarios', data),
    delete: (id)         => request('DELETE', `/scenarios/${id}`),
    chart:  (id)         => request('GET',    `/scenarios/${id}/chart`),
    status: (id)         => request('GET',    `/scenarios/${id}/status`),
  },

  health: () => request('GET', '/health'),
};
