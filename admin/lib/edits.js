function hasUnsavedEdits(currentText, savedText) {
  return String(currentText ?? "") !== String(savedText ?? "");
}

function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameJson(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key) || !sameJson(a[key], b[key])) return false;
  }
  return true;
}

function draftsDiffer(draft, published) {
  if (published === undefined) return true;
  return !sameJson(draft, published);
}

export { hasUnsavedEdits, sameJson, draftsDiffer };
