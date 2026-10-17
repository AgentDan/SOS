function ReplyBox({ text }) {
  if (typeof text !== "string" || text.length === 0) return null;
  return <p className="chat-reply">{text}</p>;
}

export { ReplyBox };
