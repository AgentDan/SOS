import { clearToken, getToken } from "../session/token.js";

function adminApiError(status, body) {
  const error = new Error(status === 0 ? "network" : `http ${status}`);
  error.name = "AdminApiError";
  error.status = status;
  error.body = body;
  return error;
}

let onUnauthorized = () => {};

function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === "function" ? handler : () => {};
}

function isAbort(err) {
  return Boolean(err && err.name === "AbortError");
}

async function request(path, { method = "GET", body, rawBody, contentType, signal } = {}) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let outbound;
  if (rawBody !== undefined) {
    headers["Content-Type"] = contentType || "application/octet-stream";
    outbound = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    outbound = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      headers,
      body: outbound,
      signal
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw adminApiError(0, null);
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
    throw adminApiError(401, payload);
  }
  if (!response.ok) throw adminApiError(response.status, payload);
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

function uploadModel(sku, data, options) {
  return request(`/models/${encodeURIComponent(sku)}`, {
    ...options,
    method: "POST",
    rawBody: data,
    contentType: "model/gltf-binary"
  });
}

export {
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
  readJournal,
  uploadModel
};
