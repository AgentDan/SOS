const banner =
  "mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[10px] border-l-4 px-3 py-2.5";

const bannerTone = {
  ok: "border-l-ok bg-ok-bg text-ok",
  warn: "border-l-warn bg-warn-bg text-warn",
  error: "border-l-err bg-err-bg text-err"
};

const bannerWord = "font-bold";

const errorLines = "m-0 list-disc pl-[1.1rem] [&_li]:my-0.5 [&_li]:[overflow-wrap:anywhere]";

const flag =
  "mt-1.5 inline-block rounded-[999px] bg-warn-bg px-2 py-0.5 text-[0.86rem] text-warn before:font-bold before:content-['!_']";

const tiles = "mb-7 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3";

const primary = "border-accent bg-accent text-accent-ink";

export { banner, bannerTone, bannerWord, errorLines, flag, primary, tiles };
