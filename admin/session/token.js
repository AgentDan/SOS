const STORAGE_KEY = "deskos.admin.token";

function getToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  sessionStorage.setItem(STORAGE_KEY, token);
}

function clearToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage can be unavailable in a private window */
  }
}

export { getToken, setToken, clearToken };
