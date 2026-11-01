import test from "node:test";
import assert from "node:assert/strict";
import { readShowColliders, writeShowColliders } from "./colliders-pref.js";

const KEY = "sos-show-colliders";

function storageDescriptor() {
  try {
    return Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  } catch {
    return undefined;
  }
}

function restoreStorage(saved) {
  if (saved) Object.defineProperty(globalThis, "localStorage", saved);
  else delete globalThis.localStorage;
}

test("the collider flag defaults to on and is stored as 1 or 0", () => {
  const saved = storageDescriptor();
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      }
    }
  });
  try {
    assert.equal(readShowColliders(), true);
    writeShowColliders(false);
    assert.equal(store.get(KEY), "0");
    assert.equal(readShowColliders(), false);
    writeShowColliders(true);
    assert.equal(store.get(KEY), "1");
    assert.equal(readShowColliders(), true);
    assert.deepEqual([...store.keys()], [KEY]);
  } finally {
    restoreStorage(saved);
  }
});

test("a missing localStorage does not throw and keeps the frames on", () => {
  const saved = storageDescriptor();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    }
  });
  try {
    assert.equal(readShowColliders(), true);
    assert.doesNotThrow(() => writeShowColliders(false));
    assert.equal(readShowColliders(), true);
  } finally {
    restoreStorage(saved);
  }
});
