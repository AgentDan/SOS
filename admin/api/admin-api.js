import { clearToken, getToken } from "../session/token.js";

class AdminApiError extends Error {
  constructor(status, body) {
    super(status === 0 ? "network" : `http ${status}`);
    this.name = "AdminApiError";
    this.status = status;
    this.body = body;
  }
}

let onUnauthorized = () => {};

function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === "function" ? handler : () => {};
}

function isAbort(err) {
  return Boolean(err && err.name === "AbortError");
}

async function request(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new AdminApiError(0, null);
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (response.status === 401) {
    clearToken();
    onUnauthorized();
    throw new AdminApiError(401, payload);
  }
  if (!response.ok) throw new AdminApiError(response.status, payload);
  return payload;
}

function listSections(options) {
  return request("/sections", options);
}

function getSection(name, options) {
  return request(`/sections/${encodeURIComponent(name)}`, options);
}

function saveDraft(name, draft, baseDraftVersion, options) {
  const body = { draft };
  if (baseDraftVersion !== undefined && baseDraftVersion !== null) body.baseDraftVersion = baseDraftVersion;
  return request(`/sections/${encodeURIComponent(name)}/draft`, { ...options, method: "PUT", body });
}

function publishSection(name, description, options) {
  return request(`/sections/${encodeURIComponent(name)}/publish`, {
    ...options,
    method: "POST",
    body: { description }
  });
}

function rollbackSection(name, version, options) {
  return request(`/sections/${encodeURIComponent(name)}/rollback`, {
    ...options,
    method: "POST",
    body: { version }
  });
}

function getHealth(options) {
  return request("/health", options);
}

function listKnobs(options) {
  return request("/knobs", options);
}

function updateKnob(id, at, value, options) {
  return request(`/knobs/${encodeURIComponent(id)}`, {
    ...options,
    method: "PUT",
    body: { at, value }
  });
}

function readJournal(limit, options) {
  return request(`/journal?limit=${encodeURIComponent(limit)}`, options);
}

export {
  AdminApiError,
  setUnauthorizedHandler,
  isAbort,
  listSections,
  getSection,
  saveDraft,
  publishSection,
  rollbackSection,
  getHealth,
  listKnobs,
  updateKnob,
  readJournal
};
