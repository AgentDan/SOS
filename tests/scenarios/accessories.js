import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog } from "../../backend/config/load.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getProfile, getScene } from "../../backend/pipeline/reads.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

const STEPS = [
  { questionId: "q_height", optionId: "h_170" },
  { questionId: "q_hand", optionId: "right" },
  { questionId: "q_work_type", optionId: "coding" },
  { text: "добавь монитор" },
  { text: "добавь второй монитор" },
  { text: "добавь клавиатуру" },
  { text: "добавь мышь" },
  { text: "поставь колонки" },
  { text: "поставь колонки" }
];

const PRICES = {
  "DESK-LEGS-1400": 79,
  "DESK-TOP-1800": 259,
  "MON-613-366": 249,
  "KB-440": 49,
  "MOUSE-65": 29,
  "SPK-100": 59
};

function rect(place, dimensions) {
  return {
    x0: place.x - dimensions.width / 2,
    x1: place.x + dimensions.width / 2,
    z0: place.z - dimensions.depth / 2,
    z1: place.z + dimensions.depth / 2
  };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

async function setup(clientId, hand) {
  const errors = [];
  const answers = [
    { questionId: "q_height", optionId: "h_170" },
    { questionId: "q_hand", optionId: hand },
    { questionId: "q_work_type", optionId: "coding" }
  ];
  for (const step of answers) {
    const result = await runTurn({ clientId, questionId: step.questionId, optionId: step.optionId });
    if (result.status !== 200) {
      errors.push(`${hand} ${step.questionId} → ${result.body?.error ?? result.status}`);
    }
  }
  const before = getScene(clientId);
  for (const sku of ["KB-440", "MOUSE-65", "SPK-100"]) {
    if (before.skus.includes(sku)) errors.push(`${hand}: ${sku} appeared before a command`);
  }
  const needIds = (getProfile(clientId).needs ?? []).map((need) => need.id);
  for (const id of needIds) {
    if (id === "keyboard" || id === "mouse" || id === "speaker") {
      errors.push(`${hand}: need ${id}`);
    }
  }
  for (const text of [
    "добавь монитор",
    "добавь второй монитор",
    "добавь клавиатуру",
    "добавь мышь",
    "поставь колонки",
    "поставь колонки"
  ]) {
    const outcome = await runMessage({ clientId, text });
    if (outcome.result?.ok !== true) {
      errors.push(`${hand} ${text}: ${outcome.result?.reasonCode ?? "no result"}`);
    }
  }
  const height = await runTurn({ clientId, questionId: "q_height", optionId: "h_170" });
  if (height.status !== 200) errors.push(`${hand} height again → ${height.body?.error ?? height.status}`);
  return errors;
}

function checkScene(errors, scene, hand) {
  const mouseX = hand === "left" ? -352.5 : 352.5;
  const expected = [
    { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 },
    { sku: "DESK-TOP-1800", x: 0, y: 1000, z: 0, rotY: 0 },
    { sku: "MON-613-366", x: -356.5, y: 1030, z: -197.5, rotY: 0 },
    { sku: "MON-613-366", x: 356.5, y: 1030, z: -197.5, rotY: 0 },
    { sku: "KB-440", x: 0, y: 1030, z: 180, rotY: 0 },
    { sku: "MOUSE-65", x: mouseX, y: 1030, z: 180, rotY: 0 },
    { sku: "SPK-100", x: -813, y: 1030, z: -245, rotY: 0 },
    { sku: "SPK-100", x: 813, y: 1030, z: -245, rotY: 0 }
  ];
  if (JSON.stringify(scene.placements) !== JSON.stringify(expected)) {
    errors.push(`${hand} placements ${JSON.stringify(scene.placements)}`);
  }
  for (const sku of ["KB-440", "MOUSE-65", "SPK-100"]) {
    if (!scene.skus.includes(sku)) errors.push(`${hand}: ${sku} was removed`);
  }
  const products = readCatalog().products;
  const sizes = new Map(products.map((product) => [product.sku, product.dimensions]));
  const onDesk = scene.placements.filter((item) => item.y === 1030);
  let outer = 0;
  for (const place of onDesk) {
    const dimensions = sizes.get(place.sku);
    if (!dimensions) {
      errors.push(`${hand}: no dimensions for ${place.sku}`);
      continue;
    }
    outer = Math.max(outer, Math.abs(place.x) + dimensions.width / 2);
  }
  if (outer > 900) errors.push(`${hand}: row extends to ${outer}, desk half is 900`);
  for (let i = 0; i < onDesk.length; i += 1) {
    for (let j = i + 1; j < onDesk.length; j += 1) {
      const a = rect(onDesk[i], sizes.get(onDesk[i].sku));
      const b = rect(onDesk[j], sizes.get(onDesk[j].sku));
      if (overlaps(a, b)) errors.push(`${hand}: ${onDesk[i].sku} overlaps ${onDesk[j].sku}`);
    }
  }
  let sum = 0;
  for (const sku of scene.skus) {
    const price = products.find((product) => product.sku === sku)?.priceEur;
    if (typeof price !== "number") errors.push(`${hand}: ${sku} has no price`);
    else sum += price;
  }
  const expectedSum = Object.entries(PRICES).reduce((total, [sku, price]) => {
    const copies = scene.skus.filter((item) => item === sku).length;
    return total + price * copies;
  }, 0);
  if (sum !== expectedSum || sum !== 79 + 259 + 249 * 2 + 49 + 29 + 59 * 2) {
    errors.push(`${hand}: order sum ${sum}`);
  }
}

async function runAccessories() {
  const errors = [];
  const stamp = Date.now();
  const clients = [
    [`scenario-accessories-right-${stamp}`, "right"],
    [`scenario-accessories-left-${stamp}`, "left"]
  ];
  try {
    for (const [clientId, hand] of clients) {
      errors.push(...(await setup(clientId, hand)));
      checkScene(errors, getScene(clientId), hand);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    for (const [clientId] of clients) {
      rmSync(path.join(CLIENTS_DIR, clientId), { recursive: true, force: true });
    }
  }
  return { errors };
}

export { STEPS as accessorySteps, runAccessories };
