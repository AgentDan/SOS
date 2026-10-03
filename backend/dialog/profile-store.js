import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_DIR = path.join(__dirname, "..", "..", "storage", "clients");

function profileDir(clientId) {
  return path.join(CLIENTS_DIR, clientId);
}

function profilePath(clientId) {
  return path.join(profileDir(clientId), "profile.json");
}

function defaultProfile(clientId) {
  return {
    clientId,
    scenario: null,
    status: "in_progress",
    fields: {},
    needs: [],
    confirmedNeeds: [],
    rejectedNeeds: []
  };
}

function loadProfile(clientId) {
  const file = profilePath(clientId);
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
    const profile = defaultProfile(clientId);
    saveProfile(profile);
    return profile;
  }
}

function saveProfile(profile) {
  mkdirSync(profileDir(profile.clientId), { recursive: true });
  writeFileSync(profilePath(profile.clientId), `${JSON.stringify(profile, null, 2)}\n`);
}

export { loadProfile, saveProfile };
