import { isPlainObject, validateSectionEnvelope } from "./envelope.js";

const HANDS = new Set(["right", "left"]);

function integerInRange(value) {
  return Number.isInteger(value) && value >= 100 && value <= 250;
}

function validateErgonomics(ergonomics, errors) {
  if (ergonomics === undefined) return;
  if (!validateSectionEnvelope(ergonomics, "ergonomics", errors)) return;

  const draft = ergonomics.draft;
  let min = null;
  let max = null;

  if (!isPlainObject(draft.bounds)) {
    errors.push("ergonomics: bounds must be an object");
  } else {
    if (!integerInRange(draft.bounds.heightMinCm)) {
      errors.push("ergonomics: bounds.heightMinCm must be an integer from 100 to 250");
    } else {
      min = draft.bounds.heightMinCm;
    }
    if (!integerInRange(draft.bounds.heightMaxCm)) {
      errors.push("ergonomics: bounds.heightMaxCm must be an integer from 100 to 250");
    } else {
      max = draft.bounds.heightMaxCm;
    }
    if (min !== null && max !== null && min >= max) {
      errors.push("ergonomics: bounds.heightMinCm must be less than bounds.heightMaxCm");
      min = null;
      max = null;
    }
  }

  if (!isPlainObject(draft.defaults)) {
    errors.push("ergonomics: defaults must be an object");
  } else {
    const height = draft.defaults.heightCm;
    const inside = min !== null && max !== null && height >= min && height <= max;
    if (!Number.isInteger(height) || (min !== null && max !== null && !inside)) {
      errors.push("ergonomics: defaults.heightCm must be an integer inside bounds");
    }
    if (!HANDS.has(draft.defaults.hand)) {
      errors.push('ergonomics: defaults.hand must be "right" or "left"');
    }
  }

  if (draft.mannequin !== undefined) {
    if (!isPlainObject(draft.mannequin)) {
      errors.push("ergonomics: mannequin must be an object");
    } else {
      if (typeof draft.mannequin.sku !== "string") {
        errors.push("ergonomics: mannequin.sku must be a string");
      }
      if (!integerInRange(draft.mannequin.referenceHeightCm)) {
        errors.push("ergonomics: mannequin.referenceHeightCm must be an integer from 100 to 250");
      }
      validateOffsetMm(draft.mannequin.offsetMm, errors);
    }
  }
}

function validateOffsetMm(offset, errors) {
  if (offset === undefined) return;
  if (!isPlainObject(offset)) {
    errors.push("ergonomics: mannequin.offsetMm must be an object");
    return;
  }
  for (const axis of ["x", "y", "z"]) {
    const value = offset[axis];
    if (typeof value !== "number" || !Number.isFinite(value) || value < -500 || value > 500) {
      errors.push(`ergonomics: mannequin.offsetMm.${axis} must be a number from -500 to 500`);
    }
  }
}

export { validateErgonomics };
