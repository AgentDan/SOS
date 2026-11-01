const SHOW_COLLIDERS_KEY = "sos-show-colliders";

function readShowColliders() {
  try {
    const value = localStorage.getItem(SHOW_COLLIDERS_KEY);
    if (value === null) return true;
    return value !== "0";
  } catch {
    return true;
  }
}

function writeShowColliders(on) {
  try {
    localStorage.setItem(SHOW_COLLIDERS_KEY, on ? "1" : "0");
  } catch {
    // хранилище может быть недоступно
  }
}

export { readShowColliders, writeShowColliders };
