import { listSections } from "../api/admin-api.js";
import { loginFailure } from "../lib/messages.js";
import { clearToken, setToken } from "../session/token.js";
import { el, fillBanner } from "../ui.js";

function mountLogin(root, { message, onSuccess }) {
  const error = el("div", { role: "alert", hidden: true });
  if (message) fillBanner(error, "error", message);

  const input = el("input", {
    type: "password",
    autocomplete: "current-password",
    autocapitalize: "off",
    spellcheck: "false"
  });
  const button = el("button", { type: "submit", className: "primary", text: "Войти" });

  const form = el(
    "form",
    { className: "login-card" },
    el("h1", { text: "Админка deskOS" }),
    el("p", { className: "muted", text: "Токен остаётся только в этом окне браузера." }),
    el("label", { className: "field" }, el("span", { text: "Токен администратора" }), input),
    button,
    error
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const token = input.value;
    if (!token) {
      fillBanner(error, "error", "Введите токен");
      return;
    }
    button.disabled = true;
    error.hidden = true;
    setToken(token);
    try {
      await listSections();
      onSuccess();
    } catch (err) {
      clearToken();
      input.value = "";
      fillBanner(error, "error", loginFailure(err && err.status));
      button.disabled = false;
      input.focus();
    }
  });

  root.replaceChildren(el("div", { className: "login-wrap" }, form));
  input.focus();
  return () => {};
}

export { mountLogin };
