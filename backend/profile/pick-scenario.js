function rulesOf(questionnaire) {
  if (Array.isArray(questionnaire?.scenarioRules)) return questionnaire.scenarioRules;
  if (Array.isArray(questionnaire?.draft?.scenarioRules)) return questionnaire.draft.scenarioRules;
  return [];
}

function defaultScenario(questionnaire) {
  if (typeof questionnaire?.defaultScenario === "string") return questionnaire.defaultScenario;
  if (typeof questionnaire?.draft?.defaultScenario === "string") return questionnaire.draft.defaultScenario;
  return null;
}

function answered(fields, questionId) {
  const value = fields?.[questionId]?.value;
  return typeof value === "string" && value.length > 0;
}

function pickScenario(questionnaire, profile) {
  const rules = rulesOf(questionnaire);
  const fields = profile?.fields ?? {};

  for (const rule of rules) {
    const questionId = rule?.when?.questionId;
    const optionId = rule?.when?.optionId;
    if (fields[questionId]?.value === optionId) return rule.scenario;
  }

  const asked = rules.some((rule) => answered(fields, rule?.when?.questionId));
  if (asked) return defaultScenario(questionnaire);
  return profile?.scenario ?? null;
}

export { pickScenario };
