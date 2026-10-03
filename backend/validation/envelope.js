function isBlank(value) {
  return value === undefined || value === null || value === "";
}

function isMissing(obj, field) {
  return !obj || isBlank(obj[field]);
}

function validateEnvelopeFields(data, sectionName, errors) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;

  if (data.section !== sectionName) {
    errors.push(`${sectionName}: section must be "${sectionName}"`);
  }
  if (!Number.isInteger(data.draftVersion)) {
    errors.push(`${sectionName}: draftVersion must be an integer`);
  }
  if (!Number.isInteger(data.publishedVersion)) {
    errors.push(`${sectionName}: publishedVersion must be an integer`);
  }
  if (!Array.isArray(data.history)) {
    errors.push(`${sectionName}: history must be an array`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkType(section, value, expected, label, errors) {
  const ok =
    expected === "array"
      ? Array.isArray(value)
      : expected === "object"
        ? isPlainObject(value)
        : typeof value === expected;
  if (!ok) {
    errors.push(`${section}: ${label} must be a ${expected}`);
  }
  return ok;
}

function validateSectionEnvelope(data, sectionName, errors) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push(`${sectionName}: missing config object`);
    return false;
  }

  validateEnvelopeFields(data, sectionName, errors);

  if (!isPlainObject(data.draft)) {
    errors.push(`${sectionName}: draft must be an object`);
    return false;
  }

  return true;
}

export {
  isBlank,
  isMissing,
  validateEnvelopeFields,
  isPlainObject,
  checkType,
  validateSectionEnvelope
};
