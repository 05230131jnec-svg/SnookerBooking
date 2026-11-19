(function () {
  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  window.SnookerApi = { api, formData };
})();
