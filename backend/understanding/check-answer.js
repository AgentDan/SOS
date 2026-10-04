function checkAnswer({ questionnaire, questionId, optionId }) {
  const question = (questionnaire?.draft?.questions ?? []).find((item) => item.id === questionId);
  if (!question) {
    return { ok: false, status: 404, body: { error: "unknown question" } };
  }

  const option = (question.options ?? []).find((item) => item.id === optionId);
  if (!option) {
    return { ok: false, status: 400, body: { error: "unknown option" } };
  }

  return { ok: true };
}

function checkConfirmation({ pending, needId, optionId }) {
  const need = (pending ?? []).find((item) => item && item.id === needId);
  if (!need) {
    return { ok: false, status: 404, body: { error: "unknown question" } };
  }

  if (optionId !== "keep" && optionId !== "reject") {
    return { ok: false, status: 400, body: { error: "unknown option" } };
  }

  return { ok: true };
}

export { checkAnswer, checkConfirmation };
