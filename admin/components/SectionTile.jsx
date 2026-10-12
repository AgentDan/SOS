function SectionTile({ item, onOpen }) {
  const published = typeof item.publishedVersion === "number" ? item.publishedVersion : "нет";
  const draft = typeof item.draftVersion === "number" ? item.draftVersion : "нет";
  return (
    <button
      type="button"
      className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(40,32,20,0.06)] dark:shadow-none hover:border-[#1f6b4a] dark:hover:border-[#3d9a6e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
      onClick={() => onOpen(item.name)}
    >
      <span className="font-[650]">{item.label}</span>
      <span className="text-[0.92rem] text-[#5e584e] dark:text-[#b7b0a4]">{`Опубликовано: версия ${published}`}</span>
      <span className="text-[0.92rem] text-[#5e584e] dark:text-[#b7b0a4]">{`Черновик: версия ${draft}`}</span>
      {item.hasUnpublishedChanges ? (
        <span className="mt-1.5 inline-block rounded-[999px] bg-[#fff4d6] dark:bg-[#3a2e12] px-2 py-0.5 text-[0.86rem] text-[#7a4e00] dark:text-[#ffe0a3] before:font-bold before:content-['!_']">
          Есть неопубликованные правки
        </span>
      ) : null}
    </button>
  );
}

export { SectionTile };
