import { fetchNext, postAnswer } from "../api/dialog-api.js";

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
