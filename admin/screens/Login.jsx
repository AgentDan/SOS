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
    <div className="grid min-h-screen place-items-center p-6">
      <form
        className="flex w-[min(420px,100%)] flex-col gap-3 rounded-2xl border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] p-6 shadow-[0_1px_2px_rgba(40,32,20,0.06)] dark:shadow-none"
        onSubmit={onSubmit}
      >
        <h1 className="mt-0 mb-0 font-[650] leading-tight text-[1.6rem]">Админка SOS</h1>
        <p className="mt-0 mb-2 text-[#5e584e] dark:text-[#b7b0a4]">Токен остаётся только в этом окне браузера.</p>
        <label className="flex flex-col gap-1">
          <span>Токен администратора</span>
          <input
            ref={inputRef}
            className="w-full rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <BusyButton busy={busy} type="submit" className="border-[#1f6b4a] dark:border-[#3d9a6e] bg-[#1f6b4a] dark:bg-[#3d9a6e] text-[#f4fff8]">
          Войти
        </BusyButton>
        {error ? <Banner kind="error" text={error} /> : null}
      </form>
    </div>
  );
}

export { Login };
