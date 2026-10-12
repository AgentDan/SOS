function SectionTile({ item, onOpen }) {
  const published = typeof item.publishedVersion === "number" ? item.publishedVersion : "нет";
  const draft = typeof item.draftVersion === "number" ? item.draftVersion : "нет";
  return (
    <button
      type="button"
      className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-line bg-surface px-4 py-3.5 text-left shadow-(--card-shadow) hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onClick={() => onOpen(item.name)}
    >
      <span className="font-strong">{item.label}</span>
      <span className="text-[0.92rem] text-muted">{`Опубликовано: версия ${published}`}</span>
      <span className="text-[0.92rem] text-muted">{`Черновик: версия ${draft}`}</span>
      {item.hasUnpublishedChanges ? (
        <span className="mt-1.5 inline-block rounded-[999px] bg-warn-bg px-2 py-0.5 text-[0.86rem] text-warn before:font-bold before:content-['!_']">
          Есть неопубликованные правки
        </span>
      ) : null}
    </button>
  );
}

export { SectionTile };
