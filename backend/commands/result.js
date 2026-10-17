function okCommand({ sceneChanged, facts, say }) {
  return {
    ok: true,
    kind: "command",
    sceneChanged,
    facts: facts ?? {},
    reasonCode: null,
    say
  };
}

function failCommand({ reasonCode, facts, say }) {
  return {
    ok: false,
    kind: "command",
    sceneChanged: false,
    facts: facts ?? {},
    reasonCode,
    say: say ?? { code: reasonCode, params: {} }
  };
}

export { okCommand, failCommand };
