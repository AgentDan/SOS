import { useState } from "react";
import { sendMessage } from "../api/dialog-api.js";

function MessageInput({ clientId, onSent }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const value = text.trim();

  async function send() {
    if (!value || busy) return;
    setBusy(true);
    try {
      const response = await sendMessage(clientId, value);
      setText("");
      if (typeof onSent === "function") await onSent(response);
    } catch (err) {
      console.error("Message failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="chat-compose"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <input
        className="chat-compose-input"
        value={text}
        aria-label="Сообщение"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          send();
        }}
      />
      <button type="submit" disabled={busy || value.length === 0}>
        Отправить
      </button>
    </form>
  );
}

export { MessageInput };
