function okTalk({ sceneChanged, facts, say }) {
  return {
    ok: true,
    kind: "talk",
    sceneChanged,
    facts: facts ?? {},
    reasonCode: null,
    say
  };
}

function failTalk({ reasonCode, facts, say }) {
  return {
    ok: false,
    kind: "talk",
    sceneChanged: false,
    facts: facts ?? {},
    reasonCode,
    say: say ?? { code: reasonCode, params: {} }
  };
}

export { okTalk, failTalk };
