function optionButton(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = option.label;
  return button;
}

function renderDone(containerEl) {
  containerEl.replaceChildren();
  const title = document.createElement("p");
  title.textContent = "Анкета пройдена";
  containerEl.append(title);
}

function renderQuestion(containerEl, question, onPick) {
  containerEl.replaceChildren();
  const title = document.createElement("p");
  title.textContent = question.textFallback;
  containerEl.append(title);

  for (const option of question.options ?? []) {
    const button = optionButton(option);
    button.addEventListener("click", () => onPick(option.id));
    containerEl.append(button);
  }
}

async function fetchNext(clientId) {
  const res = await fetch(`/api/dialog/next?clientId=${encodeURIComponent(clientId)}`);
  if (!res.ok) throw new Error(`GET /api/dialog/next failed: ${res.status}`);
  return res.json();
}

async function postAnswer(clientId, questionId, optionId) {
  
  const res = await fetch("/api/dialog/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, questionId, optionId })
  });
  if (!res.ok) throw new Error(`POST /api/dialog/answer failed: ${res.status}`);
  return res.json();
}

function mountQuestionPanel(containerEl, clientId, onAnswered) {
  if (!containerEl) return;

  async function showNext() {
    const data = await fetchNext(clientId);
    if (!data.question) {
      renderDone(containerEl);
      return;
    }

    renderQuestion(containerEl, data.question, async (optionId) => {
      await postAnswer(clientId, data.question.id, optionId);
      if (typeof onAnswered === "function") await onAnswered();
      await showNext();
    });
  }

  showNext().catch((err) => {
    console.error("Question panel failed:", err);
  });
}

export { mountQuestionPanel };
