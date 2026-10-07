// Tiny fetch wrapper for the JSON API
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Sends a file as the raw request body (used for photos)
async function upload(url, file) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name || '') },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
};

export const api = {
  status: () => request('GET', '/api/auth/status'),
  setup: (b) => request('POST', '/api/auth/setup', b),
  login: (b) => request('POST', '/api/auth/login', b),
  logout: () => request('POST', '/api/auth/logout'),
  changePassword: (b) => request('POST', '/api/auth/password', b),

  meta: () => request('GET', '/api/meta'),
  saveSettings: (b) => request('PUT', '/api/settings', b),
  stats: () => request('GET', '/api/stats'),
  activity: (params) => request('GET', '/api/activity' + qs(params)),

  bookings: (params) => request('GET', '/api/bookings' + qs(params)),
  booking: (id) => request('GET', `/api/bookings/${id}`),
  createBooking: (b) => request('POST', '/api/bookings', b),
  updateBooking: (id, b) => request('PUT', `/api/bookings/${id}`, b),
  deleteBooking: (id) => request('DELETE', `/api/bookings/${id}`),
  bookingPhotos: (id) => request('GET', `/api/bookings/${id}/photos`),
  uploadPhoto: (bookingId, file) => upload(`/api/bookings/${bookingId}/photos`, file),
  deletePhoto: (id) => request('DELETE', `/api/photos/${id}`),
  photoUrl: (id) => `/api/photos/${id}`,

  customers: (params) => request('GET', '/api/customers' + qs(params)),
  customer: (id) => request('GET', `/api/customers/${id}`),
  createCustomer: (b) => request('POST', '/api/customers', b),
  updateCustomer: (id, b) => request('PUT', `/api/customers/${id}`, b),
  deleteCustomer: (id) => request('DELETE', `/api/customers/${id}`),
  importCustomers: (customers) => request('POST', '/api/customers/import', { customers }),
  bulkDeleteCustomers: (ids) => request('POST', '/api/customers/bulk-delete', { ids }),

  team: () => request('GET', '/api/team'),
  createTeamMember: (b) => request('POST', '/api/team', b),
  updateTeamMember: (id, b) => request('PUT', `/api/team/${id}`, b),
  deleteTeamMember: (id) => request('DELETE', `/api/team/${id}`),

  users: () => request('GET', '/api/users'),
  createUser: (b) => request('POST', '/api/users', b),
  updateUser: (id, b) => request('PUT', `/api/users/${id}`, b),
  deleteUser: (id) => request('DELETE', `/api/users/${id}`),
  updateLocation: (id, b) => request('PUT', `/api/locations/${id}`, b),

  createService: (b) => request('POST', '/api/services', b),
  updateService: (id, b) => request('PUT', `/api/services/${id}`, b),
  deleteService: (id) => request('DELETE', `/api/services/${id}`),
};
