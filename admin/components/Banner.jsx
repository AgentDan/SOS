const WORDS = { ok: "Готово", warn: "Внимание", error: "Ошибка" };
const TONE = {
  ok: "border-l-ok bg-ok-bg text-ok",
  warn: "border-l-warn bg-warn-bg text-warn",
  error: "border-l-err bg-err-bg text-err"
};

function Banner({ kind, text }) {
  const tone = kind === "ok" || kind === "warn" ? kind : "error";
  return (
    <div
      className={`mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[10px] border-l-4 px-3 py-2.5 ${TONE[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="font-bold">{WORDS[tone]}</span>
      <span>{text}</span>
    </div>
  );
}

export { Banner };
