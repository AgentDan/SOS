function okResult({ kind, sceneChanged, facts, say }) {
  return {
    ok: true,
    kind,
    sceneChanged,
    facts: facts ?? {},
    reasonCode: null,
    say
  };
}

function failResult({ kind, reasonCode, facts, say }) {
  return {
    ok: false,
    kind,
    sceneChanged: false,
    facts: facts ?? {},
    reasonCode,
    say: say ?? { code: reasonCode, params: {} }
  };
}

function notImplemented(kind) {
  return failResult({
    kind,
    reasonCode: "not_implemented",
    say: { code: "not_implemented", params: {} }
  });
}

export { okResult, failResult, notImplemented };
