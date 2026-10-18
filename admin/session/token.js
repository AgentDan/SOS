const STORAGE_KEY = "sos.admin.token";

function getToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* storage can be unavailable in a private window */
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage can be unavailable in a private window */
  }
}

export { getToken, setToken, clearToken };
