import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import test from "node:test";
import assert from "node:assert/strict";
import dialogRoutes from "./dialog.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientId = "unknown-question-no-profile";
const profileFile = path.join(__dirname, "..", "..", "storage", "clients", clientId, "profile.json");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("unknown question does not create a profile file", async () => {
  rmSync(path.dirname(profileFile), { recursive: true, force: true });

  const app = express();
  app.use(express.json());
  app.use(dialogRoutes);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/dialog/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, questionId: "missing_question", optionId: "coding" })
    });

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "unknown question" });
    assert.equal(existsSync(profileFile), false);
  } finally {
    await close(server);
    rmSync(path.dirname(profileFile), { recursive: true, force: true });
  }
});
