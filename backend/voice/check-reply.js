function numberSet(text) {
  const found = String(text).match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [...new Set(found.map((token) => token.replace(",", ".")))].sort();
}

function sameNumbers(template, candidate) {
  return JSON.stringify(numberSet(template)) === JSON.stringify(numberSet(candidate));
}

function sentences(text) {
  return text
    .split(/[.!?…]+(?=\s|$)/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function words(text) {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

function stemHit(text, stems) {
  if (!Array.isArray(stems)) return false;
  const hay = text.toLowerCase();
  return stems.some(
    (stem) => typeof stem === "string" && stem.length > 0 && hay.includes(stem.toLowerCase())
  );
}

function emojiCount(text) {
  const found = text.match(/\p{Extended_Pictographic}/gu);
  return found ? found.length : 0;
}

function hasLink(text) {
  const lower = text.toLowerCase();
  return lower.includes("http") || lower.includes("www") || text.includes("@");
}

function hasCyrillic(text) {
  return /[а-яё]/i.test(text);
}

function reject(reason) {
  return { ok: false, reason };
}

function checkReply({ template, candidate, rules } = {}) {
  const limits = rules && typeof rules === "object" ? rules : {};
  if (typeof candidate !== "string" || candidate.trim() === "") return reject("empty");

  const text = candidate.trim();
  const source = typeof template === "string" ? template : "";
  const parts = sentences(text);
  if (parts.length === 0) return reject("empty");
  if (parts.length > 2) return reject("too_long");

  const maxWords = limits.maxWords;
  if (
    typeof maxWords === "number" &&
    Number.isFinite(maxWords) &&
    maxWords >= 1 &&
    words(text).length > maxWords
  ) {
    return reject("too_long");
  }

  if (!sameNumbers(source, text)) return reject("number_changed");
  if (limits.noPromises === true && stemHit(text, limits.bannedStems)) return reject("banned_word");
  if (limits.noPressure === true && stemHit(text, limits.pressureStems)) return reject("pressure");

  const emojis = emojiCount(text);
  if (limits.emoji === false && emojis > 0) return reject("emoji");
  if (limits.emoji === true && emojis > 1) return reject("emoji");
  if (hasLink(text)) return reject("link");
  if (hasCyrillic(source) && !hasCyrillic(text)) return reject("language");
  return { ok: true };
}

export { checkReply };
