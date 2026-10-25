import { AiNote } from "./ai-note.js";

function ReplyBox({ text, meta, showAi }) {
  if (typeof text !== "string" || text.length === 0) return null;
  return (
    <div className="chat-reply">
      <p className="chat-reply-text">{text}</p>
      <AiNote meta={meta} show={showAi} />
    </div>
  );
}

export { ReplyBox };
