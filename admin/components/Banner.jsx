const WORDS = { ok: "Готово", warn: "Внимание", error: "Ошибка" };
const CLASSES = { ok: "banner-ok", warn: "banner-warn", error: "banner-error" };

function Banner({ kind, text }) {
  const tone = kind === "ok" || kind === "warn" ? kind : "error";
  return (
    <div className={`banner ${CLASSES[tone]}`} role={tone === "error" ? "alert" : "status"}>
      <span className="banner-word">{WORDS[tone]}</span>
      <span className="banner-text">{text}</span>
    </div>
  );
}

export { Banner };
