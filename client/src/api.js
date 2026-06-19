const API_URL = import.meta.env.VITE_API_URL || '';
const BASE_URL = `${API_URL.replace(/\/$/, '')}/api`;

const getHeaders = () => {
  // Read token from sessionStorage so each tab uses its own independent session
  const token = sessionStorage.getItem('wms_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

let cache = {};
const clearCache = () => { cache = {}; };

const handleResponse = async (res) => {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}`);
  }

  if (res.status === 401) {
    clearCache();
    sessionStorage.removeItem('wms_token');
    sessionStorage.removeItem('wms_user');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

const api = {
  clearCache,

  async post(path, body) {
    clearCache();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async get(path) {
    if (cache[path]) return cache[path];
    
    const requestPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: getHeaders(),
        });
        return await handleResponse(res);
      } catch (err) {
        delete cache[path]; // Don't cache errors
        throw err;
      }
    })();
    
    cache[path] = requestPromise;
    return requestPromise;
  },

  async put(path, body) {
    clearCache();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async delete(path) {
    clearCache();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },
};

export default api;
