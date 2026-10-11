import { useEffect, useRef, useState } from "react";
import { listSections } from "../api/admin-api.js";
import { loginFailure } from "../lib/messages.js";
import { clearToken, setToken } from "../session/token.js";
import { Banner } from "../components/Banner.jsx";
import { BusyButton } from "../components/BusyButton.jsx";

function Login({ message, onSuccess }) {
  const [error, setError] = useState(message || "");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (message) setError(message);
  }, [message]);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const token = inputRef.current ? inputRef.current.value : "";
    if (!token) {
      setError("Введите токен");
      return;
    }
    setBusy(true);
    setError("");
    setToken(token);
    try {
      await listSections();
      onSuccess();
    } catch (err) {
      clearToken();
      if (inputRef.current) inputRef.current.value = "";
      setError(loginFailure(err && err.status));
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Админка SOS</h1>
        <p className="muted">Токен остаётся только в этом окне браузера.</p>
        <label className="field">
          <span>Токен администратора</span>
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <BusyButton busy={busy} type="submit" className="primary">
          Войти
        </BusyButton>
        {error ? <Banner kind="error" text={error} /> : null}
      </form>
    </div>
  );
}

export { Login };
