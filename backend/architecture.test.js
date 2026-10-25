import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");
const CLIENT = path.join(ROOT, "client");
const ADMIN = path.join(ROOT, "admin");

const API = path.join(BACKEND, "api");
const PIPELINE = path.join(BACKEND, "pipeline");
const AI = path.join(BACKEND, "ai");
const CONFIG = path.join(BACKEND, "config");

const BLOCK_NAMES = [
  "understanding",
  "profile",
  "scene",
  "needs",
  "sales",
  "director",
  "voice",
  "commands",
  "talk",
  "ergonomics"
];
const BLOCK_DIRS = BLOCK_NAMES.map((name) => path.join(BACKEND, name));
const CLIENT_PARTS = ["chat", "summary", "order", "scene"].map((name) => path.join(CLIENT, name));
const CLIENT_API = path.join(CLIENT, "api");
const CLIENT_SESSION = path.join(CLIENT, "session");
const ADMIN_API = path.join(ADMIN, "api");

function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, acc);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".jsx")) acc.push(full);
  }
  return acc;
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  return path.normalize(path.join(path.dirname(fromFile), spec));
}

function walkIfExists(dir) {
  try {
    return walkJs(dir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function record(found, file, spec) {
  found.push(`${file} imports ${spec}`);
}

function violations() {
  const found = [];
  const files = [...walkIfExists(BACKEND), ...walkIfExists(CLIENT), ...walkIfExists(ADMIN)];
  const apiAllowed = [
    API,
    PIPELINE,
    path.join(BACKEND, "orders"),
    path.join(BACKEND, "sessions"),
    path.join(BACKEND, "admin-api"),
    CONFIG
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (isInside(file, CLIENT) && !isInside(file, CLIENT_API) && /\bfetch\s*\(/.test(source)) {
      found.push(`${file} calls fetch(`);
    }
    if (isInside(file, ADMIN) && !isInside(file, ADMIN_API) && /\bfetch\s*\(/.test(source)) {
      found.push(`${file} calls fetch(`);
    }

    for (const spec of importSpecifiers(source)) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved) continue;

      const callerBlock = BLOCK_DIRS.find((dir) => isInside(file, dir));
      const aiCaller =
        isInside(file, path.join(BACKEND, "understanding")) ||
        isInside(file, path.join(BACKEND, "voice")) ||
        isInside(file, AI);

      if (isInside(resolved, AI) && !aiCaller) {
        record(found, file, spec);
      }

      if (isInside(file, API) && !apiAllowed.some((dir) => isInside(resolved, dir))) {
        record(found, file, spec);
      }

      if (callerBlock && !isInside(resolved, callerBlock)) {
        const aiException =
          isInside(resolved, AI) &&
          (isInside(file, path.join(BACKEND, "understanding")) ||
            isInside(file, path.join(BACKEND, "voice")));
        const distanceException =
          isInside(file, path.join(BACKEND, "commands")) &&
          path.normalize(resolved) === path.normalize(path.join(BACKEND, "scene", "distance.js"));
        if (!aiException && !distanceException) record(found, file, spec);
      }

      if (isInside(file, AI)) {
        const banned = [API, PIPELINE, CLIENT, ADMIN, ...BLOCK_DIRS];
        if (banned.some((dir) => isInside(resolved, dir))) record(found, file, spec);
      }

      if (isInside(file, PIPELINE) && isInside(resolved, API)) {
        record(found, file, spec);
      }

      if (isInside(file, CLIENT) && (isInside(resolved, BACKEND) || isInside(resolved, ADMIN))) {
        record(found, file, spec);
      }

      if (isInside(file, ADMIN) && (isInside(resolved, BACKEND) || isInside(resolved, CLIENT))) {
        record(found, file, spec);
      }

      const clientPart = CLIENT_PARTS.find((dir) => isInside(file, dir));
      if (clientPart) {
        const shared = isInside(resolved, CLIENT_API) || isInside(resolved, CLIENT_SESSION);
        if (!isInside(resolved, clientPart) && !shared) record(found, file, spec);
      }
    }
  }

  return found;
}

test("modules honor the dependency rules", () => {
  const found = violations();
  assert.deepEqual(found, [], found.join("\n"));
});

test("llm.js does not import blocks", () => {
  const specs = importSpecifiers(readFileSync(path.join(AI, "llm.js"), "utf8"));
  for (const spec of specs) assert.equal(spec.startsWith("node:"), true, spec);
});

test("parse-with-llm.js imports only ai", () => {
  const file = path.join(BACKEND, "understanding", "parse-with-llm.js");
  const specs = importSpecifiers(readFileSync(file, "utf8"));
  assert.deepEqual(specs, ["../ai/llm.js"]);
});

test("check-reply.js and speak-with-llm.js import only ai or each other", () => {
  const voice = path.join(BACKEND, "voice");
  const allowed = new Set([
    path.normalize(path.join(AI, "llm.js")),
    path.normalize(path.join(voice, "check-reply.js")),
    path.normalize(path.join(voice, "speak-with-llm.js"))
  ]);
  for (const name of ["check-reply.js", "speak-with-llm.js"]) {
    const file = path.join(voice, name);
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      assert.equal(spec.startsWith("."), true, spec);
      const resolved = resolveSpecifier(file, spec);
      assert.ok(resolved && allowed.has(path.normalize(resolved)), spec);
    }
  }
});

test("only pipeline calls check-reply.js and speak-with-llm.js", () => {
  const voiceDir = path.join(BACKEND, "voice");
  const targets = ["check-reply.js", "speak-with-llm.js"].map((name) =>
    path.normalize(path.join(voiceDir, name))
  );
  const found = [];
  const files = [...walkIfExists(BACKEND), ...walkIfExists(CLIENT), ...walkIfExists(ADMIN)];
  for (const file of files) {
    if (isInside(file, voiceDir) || isInside(file, PIPELINE)) continue;
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(file, spec);
      if (resolved && targets.includes(path.normalize(resolved))) found.push(`${file} imports ${spec}`);
    }
  }
  assert.deepEqual(found, [], found.join("\n"));
});

test("body.js does not import other blocks", () => {
  const source = readFileSync(path.join(BACKEND, "profile", "body.js"), "utf8");
  assert.deepEqual(importSpecifiers(source), []);
});

test("ergo-answer.js does not import other blocks", () => {
  const file = path.join(BACKEND, "talk", "ergo-answer.js");
  const talkDir = path.join(BACKEND, "talk");
  for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
    assert.equal(spec.startsWith("."), true, spec);
    const resolved = resolveSpecifier(file, spec);
    assert.ok(resolved && isInside(resolved, talkDir), spec);
  }
});

test("ergonomics.js imports nothing", () => {
  const source = readFileSync(path.join(BACKEND, "ergonomics", "ergonomics.js"), "utf8");
  assert.deepEqual(importSpecifiers(source), []);
});

test("only pipeline imports the ergonomics block", () => {
  const ergoDir = path.join(BACKEND, "ergonomics");
  const found = [];
  const files = [...walkIfExists(BACKEND), ...walkIfExists(CLIENT), ...walkIfExists(ADMIN)];
  for (const file of files) {
    if (isInside(file, ergoDir) || isInside(file, PIPELINE)) continue;
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(file, spec);
      if (resolved && isInside(resolved, ergoDir)) found.push(`${file} imports ${spec}`);
    }
  }
  assert.deepEqual(found, [], found.join("\n"));
});

test("layout.js, distance.js and person.js import nothing", () => {
  for (const name of ["layout.js", "distance.js", "person.js"]) {
    const source = readFileSync(path.join(BACKEND, "scene", name), "utf8");
    assert.deepEqual(importSpecifiers(source), [], name);
  }
});

test("commands reach scene only through distance.js", () => {
  const sceneDir = path.join(BACKEND, "scene");
  const distanceFile = path.normalize(path.join(sceneDir, "distance.js"));
  for (const file of walkJs(path.join(BACKEND, "commands"))) {
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved || !isInside(resolved, sceneDir)) continue;
      assert.equal(path.normalize(resolved), distanceFile, `${file} imports ${spec}`);
    }
  }
});

test("only applySceneChange writes sceneEdits", () => {
  const allowed = path.normalize(path.join(BACKEND, "scene", "apply-scene-change.js"));
  const writePattern =
    /sceneEdits\s*=|sceneEdits\s*\?\?=|sceneEdits\s*\|\|=|\.sceneEdits\.push\(|\.sceneEdits\.splice\(|\.sceneEdits\.length\s*=/;
  const found = [];

  for (const file of walkIfExists(BACKEND)) {
    if (file.endsWith(".test.js")) continue;
    if (path.normalize(file) === allowed) continue;
    const source = readFileSync(file, "utf8");
    if (writePattern.test(source)) found.push(file);
  }

  assert.deepEqual(found, [], found.join("\n"));
});
