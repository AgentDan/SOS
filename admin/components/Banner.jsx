const WORDS = { ok: "Готово", warn: "Внимание", error: "Ошибка" };
const TONE = {
  ok: "border-l-[#0f6b3c] dark:border-l-[#b7ebc9] bg-[#e5f6ec] dark:bg-[#163226] text-[#0f6b3c] dark:text-[#b7ebc9]",
  warn: "border-l-[#7a4e00] dark:border-l-[#ffe0a3] bg-[#fff4d6] dark:bg-[#3a2e12] text-[#7a4e00] dark:text-[#ffe0a3]",
  error: "border-l-[#8e1d1d] dark:border-l-[#ffb4b4] bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#8e1d1d] dark:text-[#ffb4b4]"
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
