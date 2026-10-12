import { banner, bannerTone, bannerWord } from "../styles/classes.js";

const WORDS = { ok: "Готово", warn: "Внимание", error: "Ошибка" };

function Banner({ kind, text }) {
  const tone = kind === "ok" || kind === "warn" ? kind : "error";
  return (
    <div className={`${banner} ${bannerTone[tone]}`} role={tone === "error" ? "alert" : "status"}>
      <span className={bannerWord}>{WORDS[tone]}</span>
      <span>{text}</span>
    </div>
  );
}

export { Banner };
