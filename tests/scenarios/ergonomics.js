import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog, readErgonomics, readQuestionnaire } from "../../backend/config/load.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// q_work_type=coding ставит DESK-TOP-1800. Стол 1400 — команда «замени стол»
// до предметов на столешнице: слово «стол» указывает на DESK-TOP-1400, его на сцене нет,
// и замена берёт стоящий desk_top. Кресло нужно манекену и ответу «удобно ли мне?».
const HEIGHTS = ["h_u160", "h_170", "h_190"];
const HANDS = ["right", "left"];
const DESKS = [1800, 1400];
const ON_DESK = new Set(["monitor", "keyboard", "mouse", "speaker"]);
const ROW = new Set(["monitor", "speaker"]);
const FIT_OUT = ["поставь кресло", "добавь монитор", "добавь клавиатуру", "добавь мышь", "поставь колонки"];

const STEPS = [];
for (const heightId of HEIGHTS) {
  for (const hand of HANDS) {
    for (const desk of DESKS) STEPS.push({ heightId, hand, desk });
  }
}

function heightOf(optionId) {
  const questions = readQuestionnaire()?.questions;
  const question = Array.isArray(questions) ? questions.find((item) => item?.id === "q_height") : null;
  const options = Array.isArray(question?.options) ? question.options : [];
  const option = options.find((item) => item?.id === optionId);
  return Number.isInteger(option?.heightCm) ? option.heightCm : null;
}

function size(product, key) {
  const value = product?.dimensions?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function productMap(products) {
  return new Map(products.map((product) => [product.sku, product]));
}

function cm(mm) {
  return Math.round(mm / 10);
}

function numbersIn(text) {
  return (String(text).match(/\d+(?:[.,]\d+)?/g) ?? []).map((token) => token.replace(",", "."));
}

function scaleOf(heightCm, reference) {
  if (typeof heightCm !== "number" || typeof reference !== "number" || !(reference > 0)) return null;
  return Math.min(1.3, Math.max(0.7, heightCm / reference));
}

function expectedTargets(heightCm, hand, table) {
  const seatHeightMm = Math.round(heightCm * table.seatHeightFactor);
  const deskHeightMm = Math.round(heightCm * table.deskHeightFactor);
  const eyeHeightMm = Math.round(seatHeightMm + heightCm * table.eyeAboveSeatFactor);
  const monitorDistanceMm = Math.round(
    Math.min(table.monitorDistanceMaxMm, Math.max(table.monitorDistanceMinMm, heightCm * table.monitorDistanceFactor))
  );
  return {
    seatHeightMm,
    deskHeightMm,
    eyeHeightMm,
    monitorDistanceMm,
    monitorTopMm: eyeHeightMm,
    hand
  };
}

function priceSum(scene, products) {
  let sum = 0;
  for (const sku of scene.skus) {
    const price = products.get(sku)?.priceEur;
    if (typeof price === "number") sum += price;
  }
  return sum;
}

function typePrice(products, typeId) {
  let price = null;
  for (const product of products.values()) {
    if (product?.type !== typeId || typeof product.priceEur !== "number") continue;
    if (price === null) price = product.priceEur;
    else if (price !== product.priceEur) return null;
  }
  return price;
}

function footprint(place, dimensions) {
  const turns = ((((place.rotY ?? 0) % 360) + 360) % 360);
  const swap = turns === 90 || turns === 270;
  const across = swap ? dimensions.depth : dimensions.width;
  const along = swap ? dimensions.width : dimensions.depth;
  return {
    x0: place.x - across / 2,
    x1: place.x + across / 2,
    z0: place.z - along / 2,
    z1: place.z + along / 2,
    across
  };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

function tagOf(index, combo, heightCm) {
  const height = heightCm === null ? combo.heightId : `${heightCm} см`;
  return `комбинация ${index} (${height}, ${combo.hand}, стол ${combo.desk})`;
}

async function say(clientId, text, errors, tag) {
  const outcome = await runMessage({ clientId, text });
  const via = outcome.response?.reply?.via;
  if (via !== "template") errors.push(`${tag} «${text}»: reply.via ${JSON.stringify(via)}`);
  return outcome;
}

async function answer(clientId, questionId, optionId, errors, tag) {
  const result = await runTurn({ clientId, questionId, optionId });
  if (result.status !== 200) {
    errors.push(`${tag} ${questionId}/${optionId} → ${result.body?.error ?? result.status}`);
  } else if (result.response?.reply?.via !== "template") {
    errors.push(`${tag} ${questionId}: reply.via ${JSON.stringify(result.response?.reply?.via)}`);
  }
  return result;
}

function placed(scene, products, typeId) {
  return scene.placements.find((place) => products.get(place.sku)?.type === typeId) ?? null;
}

function checkPositions(errors, tag, scene, products) {
  const legs = placed(scene, products, "desk_legs");
  const top = placed(scene, products, "desk_top");
  const legsProduct = legs ? products.get(legs.sku) : null;
  const topProduct = top ? products.get(top.sku) : null;
  const legsHeight = size(legsProduct, "height");
  const topHeight = size(topProduct, "height");
  if (!legs || legs.y !== 0) errors.push(`${tag}: ножки не на полу, y=${legs ? legs.y : "нет"}`);
  if (!top || legsHeight === null || top.y !== (legs ? legs.y : 0) + legsHeight) {
    errors.push(`${tag}: столешница не на ножках, y=${top ? top.y : "нет"}`);
  }
  const surface = top && topHeight !== null ? top.y + topHeight : null;
  const onDesk = [];
  for (const place of scene.placements) {
    const product = products.get(place.sku);
    if (!product || !ON_DESK.has(product.type)) continue;
    onDesk.push(place);
    if (surface === null || place.y !== surface) {
      errors.push(`${tag}: ${place.sku} y=${place.y}, верх столешницы ${surface}`);
    }
  }
  for (let i = 0; i < onDesk.length; i += 1) {
    for (let j = i + 1; j < onDesk.length; j += 1) {
      const aSize = products.get(onDesk[i].sku)?.dimensions;
      const bSize = products.get(onDesk[j].sku)?.dimensions;
      if (!aSize || !bSize) {
        errors.push(`${tag}: нет габаритов ${onDesk[i].sku} или ${onDesk[j].sku}`);
        continue;
      }
      if (overlaps(footprint(onDesk[i], aSize), footprint(onDesk[j], bSize))) {
        errors.push(`${tag}: ${onDesk[i].sku} пересекается с ${onDesk[j].sku}`);
      }
    }
  }
  const topWidth = size(topProduct, "width");
  if (topWidth === null) {
    errors.push(`${tag}: у столешницы нет ширины`);
  } else {
    let outer = 0;
    for (const place of onDesk) {
      if (!ROW.has(products.get(place.sku)?.type)) continue;
      const dimensions = products.get(place.sku)?.dimensions;
      if (!dimensions) continue;
      outer = Math.max(outer, Math.abs(place.x) + footprint(place, dimensions).across / 2);
    }
    if (outer > topWidth / 2) errors.push(`${tag}: ряд мониторов и колонок до ${outer} мм, столешница ${topWidth} мм`);
  }
  return surface;
}

function checkHand(errors, tag, scene, products, hand) {
  const keyboard = placed(scene, products, "keyboard");
  const mouse = placed(scene, products, "mouse");
  if (!keyboard || !mouse) {
    errors.push(`${tag}: нет клавиатуры или мыши`);
    return;
  }
  const right = hand === "right";
  const ok = right ? mouse.x > keyboard.x : mouse.x < keyboard.x;
  if (!ok) {
    errors.push(
      `${tag}: мышь ${right ? "не справа" : "не слева"} от клавиатуры (мышь x=${mouse.x}, клавиатура x=${keyboard.x})`
    );
  }
}

function checkPerson(errors, tag, scene, products, heightCm, reference) {
  const chair = placed(scene, products, "chair");
  const person = scene.person;
  const scale = scaleOf(heightCm, reference);
  if (!person || !chair) {
    errors.push(`${tag}: манекен ${person ? "есть" : "нет"}, кресло ${chair ? "есть" : "нет"}`);
    return;
  }
  if (person.scale !== scale) {
    errors.push(`${tag}: person.scale ${person.scale} ≠ ${scale} (${heightCm}/${reference})`);
  }
  if (person.x !== chair.x || person.z !== chair.z || person.rotY !== chair.rotY) {
    errors.push(
      `${tag}: манекен x=${person.x} z=${person.z} rotY=${person.rotY}, кресло x=${chair.x} z=${chair.z} rotY=${chair.rotY}`
    );
  }
}

function checkTargets(errors, tag, scene, heightCm, hand, table) {
  const expected = expectedTargets(heightCm, hand, table);
  const actual = scene.ergo?.targets;
  const fields = ["seatHeightMm", "deskHeightMm", "eyeHeightMm", "monitorDistanceMm", "monitorTopMm", "hand"];
  if (!actual || typeof actual !== "object") {
    errors.push(`${tag}: цели эргономики отсутствуют`);
    return expected;
  }
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      errors.push(`${tag}: ${field} ${JSON.stringify(actual[field])} ≠ ${JSON.stringify(expected[field])}`);
    }
  }
  for (const field of Object.keys(actual)) {
    if (!fields.includes(field)) errors.push(`${tag}: лишнее поле цели ${field}`);
  }
  return expected;
}

function checkDeskIssue(errors, tag, scene, surface) {
  const issues = Array.isArray(scene.ergo?.issues) ? scene.ergo.issues : [];
  const desk = issues.find((item) => item?.code === "desk_too_high") ?? null;
  if (surface === 1030 && !desk) errors.push(`${tag}: при столе 1030 мм нет desk_too_high`);
  if (surface !== 1030) errors.push(`${tag}: верх стола ${surface} мм, а не 1030`);
  if (desk && desk.actualMm !== surface) {
    errors.push(`${tag}: desk_too_high actualMm ${desk.actualMm} ≠ верх стола ${surface}`);
  }
  return desk;
}

function checkReplyNumbers(errors, tag, text, desk, heightCm) {
  if (!text.startsWith("Стол высоковат")) {
    errors.push(`${tag}: «удобно ли мне?» → ${JSON.stringify(text)}`);
    return;
  }
  if (!desk) return;
  const expected = [String(cm(desk.actualMm)), String(cm(desk.targetMm))].sort();
  const got = numbersIn(text).sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    errors.push(`${tag}: числа реплики ${JSON.stringify(got)} ≠ замечание ${JSON.stringify(expected)} см`);
  }
  if (heightCm === 155 && JSON.stringify(got) !== JSON.stringify(["103", "64"])) {
    errors.push(`${tag}: для роста 155 нужны 103 и 64 см, реплика ${JSON.stringify(text)}`);
  }
}

function checkOrder(errors, tag, scene, products, mannequinSku) {
  if (mannequinSku && scene.skus.includes(mannequinSku)) {
    errors.push(`${tag}: манекен ${mannequinSku} входит в заказ`);
  }
  if (scene.person && scene.skus.includes(scene.person.sku)) {
    errors.push(`${tag}: манекен ${scene.person.sku} входит в skus`);
  }
  for (const sku of scene.skus) {
    if (typeof products.get(sku)?.priceEur !== "number") errors.push(`${tag}: у ${sku} нет цены каталога`);
  }
}

function compareHeights(errors, rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.hand}/${row.desk}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const fields = [
    ["deskHeightMm", "цель стола"],
    ["eyeHeightMm", "глаза"],
    ["monitorDistanceMm", "расстояние до экрана"]
  ];
  for (const [key, group] of groups) {
    const ordered = group.slice().sort((a, b) => a.heightCm - b.heightCm);
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      for (const [field, label] of fields) {
        const left = prev.targets?.[field];
        const right = next.targets?.[field];
        if (typeof left !== "number" || typeof right !== "number") continue;
        if (right < left) {
          errors.push(
            `комбинации ${prev.index} и ${next.index} (${key}): ${label} убывает ${left} → ${right} при росте ${prev.heightCm} → ${next.heightCm}`
          );
        }
      }
      if (typeof prev.deskDelta === "number" && typeof next.deskDelta === "number" && !(next.deskDelta < prev.deskDelta)) {
        errors.push(
          `комбинации ${prev.index} и ${next.index} (${key}): deltaMm не убывает ${prev.deskDelta} → ${next.deskDelta} при росте ${prev.heightCm} → ${next.heightCm}`
        );
      }
    }
  }
}

function printTable(rows) {
  const header = ["#", "рост", "рука", "стол", "предметы", "scale", "цель стола мм", "экран мм", "замечания"];
  const body = rows.map((row) => [
    String(row.index),
    row.heightCm == null ? "—" : String(row.heightCm),
    row.hand,
    String(row.desk),
    row.items == null ? "—" : String(row.items),
    typeof row.scale === "number" ? row.scale.toFixed(4) : "—",
    row.deskTarget == null ? "—" : String(row.deskTarget),
    row.screen == null ? "—" : String(row.screen),
    row.issueCount == null ? "—" : String(row.issueCount)
  ]);
  const widths = header.map((cell, index) => Math.max(cell.length, ...body.map((line) => line[index].length)));
  const format = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  console.log("ergonomics");
  console.log(format(header));
  for (const line of body) console.log(format(line));
}

async function expectCommand(clientId, text, errors, tag, products, expected) {
  const before = getScene(clientId);
  const beforeJson = JSON.stringify(before);
  const beforeSum = priceSum(before, products);
  const outcome = await say(clientId, text, errors, tag);
  const after = getScene(clientId);
  const problems = [];
  if (expected.ok) {
    if (outcome.result?.ok !== true) {
      problems.push(`ожидал ok, получил ${outcome.result?.reasonCode ?? "нет результата"}`);
    }
  } else {
    const refused = outcome.result?.ok === false && outcome.result?.reasonCode === expected.reason;
    if (!refused) {
      const got = outcome.result?.ok === true ? "ok" : (outcome.result?.reasonCode ?? "нет результата");
      problems.push(`ожидал отказ ${expected.reason}, получил ${got}`);
    }
  }
  const afterSum = priceSum(after, products);
  const same = JSON.stringify(after) === beforeJson;
  if (expected.ok) {
    if (same) problems.push("сцена не изменилась");
    if (afterSum - beforeSum !== expected.delta) {
      problems.push(`сумма ${beforeSum} → ${afterSum}, ожидал +${expected.delta}`);
    }
  } else {
    if (!same) problems.push("сцена изменилась");
    if (afterSum !== beforeSum) problems.push(`сумма ${beforeSum} → ${afterSum}`);
  }
  if (problems.length > 0) errors.push(`${tag} «${text}»: ${problems.join("; ")}`);
}

async function runCombo(clientId, combo, index, errors, products, table, reference, mannequinSku) {
  const heightCm = heightOf(combo.heightId);
  const tag = tagOf(index, combo, heightCm);
  if (heightCm === null) errors.push(`${tag}: в анкете нет роста для ${combo.heightId}`);

  for (const step of [
    { questionId: "q_height", optionId: combo.heightId },
    { questionId: "q_hand", optionId: combo.hand },
    { questionId: "q_work_type", optionId: "coding" }
  ]) {
    await answer(clientId, step.questionId, step.optionId, errors, tag);
  }

  if (combo.desk === 1400) {
    const replaced = await say(clientId, "замени стол", errors, tag);
    if (replaced.result?.ok !== true) {
      errors.push(`${tag} «замени стол»: ${replaced.result?.reasonCode ?? "нет результата"}`);
    }
  }

  for (const text of FIT_OUT) {
    const outcome = await say(clientId, text, errors, tag);
    if (outcome.result?.ok !== true) {
      errors.push(`${tag} «${text}»: ${outcome.result?.reasonCode ?? "нет результата"}`);
    }
  }

  const scene = getScene(clientId);
  const again = getScene(clientId);
  if (JSON.stringify(scene) !== JSON.stringify(again)) errors.push(`${tag}: два getScene различаются`);

  const top = placed(scene, products, "desk_top");
  const width = size(top ? products.get(top.sku) : null, "width");
  if (width !== combo.desk) errors.push(`${tag}: столешница ${top?.sku ?? "нет"} шириной ${width}`);

  const surface = checkPositions(errors, tag, scene, products);
  checkHand(errors, tag, scene, products, combo.hand);
  checkPerson(errors, tag, scene, products, heightCm, reference);
  if (table && heightCm !== null) checkTargets(errors, tag, scene, heightCm, combo.hand, table);
  const desk = checkDeskIssue(errors, tag, scene, surface);
  checkOrder(errors, tag, scene, products, mannequinSku);

  const asked = await say(clientId, "удобно ли мне?", errors, tag);
  checkReplyNumbers(errors, tag, asked.response?.reply?.text ?? "", desk, heightCm);

  // Лимиты после обстановки. Отказ не меняет сцену и сумму.
  // Колонка при ok прибавляет свою цену; второй монитор встаёт только на 1800.
  const speakerPrice = typePrice(products, "speaker");
  const monitorPrice = typePrice(products, "monitor");
  await expectCommand(
    clientId,
    "добавь второй монитор",
    errors,
    tag,
    products,
    combo.desk === 1400 ? { ok: false, reason: "host_full" } : { ok: true, delta: monitorPrice }
  );
  await expectCommand(clientId, "поставь колонки", errors, tag, products, { ok: true, delta: speakerPrice });
  // Третья колонка: сначала место, потом лимит типа — на 1800 ряд полон (host_full), на 1400 место есть (limit).
  await expectCommand(clientId, "поставь колонки", errors, tag, products, {
    ok: false,
    reason: combo.desk === 1800 ? "host_full" : "limit"
  });

  return {
    index,
    heightCm,
    hand: combo.hand,
    desk: combo.desk,
    items: scene.skus.length,
    scale: scene.person?.scale,
    deskTarget: scene.ergo?.targets?.deskHeightMm ?? null,
    screen: scene.ergo?.targets?.monitorDistanceMm ?? null,
    issueCount: Array.isArray(scene.ergo?.issues) ? scene.ergo.issues.length : null,
    targets: scene.ergo?.targets ?? null,
    deskDelta: typeof desk?.deltaMm === "number" ? desk.deltaMm : null
  };
}

async function runErgonomics() {
  const errors = [];
  const rows = [];
  if (process.env.AI_ENABLED === "true") {
    errors.push("AI_ENABLED=true: сценарий не должен вызывать AI");
    printTable(rows);
    return { errors };
  }

  const ergonomics = readErgonomics();
  const table = ergonomics?.table;
  const reference = ergonomics?.mannequin?.referenceHeightCm;
  const mannequinSku = ergonomics?.mannequin?.sku;
  const products = productMap(readCatalog().products ?? []);
  if (reference !== 180) errors.push(`referenceHeightCm ${JSON.stringify(reference)} ≠ 180`);
  if (!table) errors.push("ergonomics.table отсутствует");

  const stamp = Date.now();
  const clients = [];
  try {
    for (let index = 0; index < STEPS.length; index += 1) {
      const clientId = `scenario-ergonomics-${stamp}-${index + 1}`;
      clients.push(clientId);
      rows.push(
        await runCombo(clientId, STEPS[index], index + 1, errors, products, table, reference, mannequinSku)
      );
    }
    compareHeights(errors, rows);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    for (const clientId of clients) {
      rmSync(path.join(CLIENTS_DIR, clientId), { recursive: true, force: true });
    }
  }
  printTable(rows);
  return { errors };
}

export { STEPS as ergonomicsSteps, runErgonomics };
