function SectionTile({ item, onOpen }) {
  const published = typeof item.publishedVersion === "number" ? item.publishedVersion : "нет";
  const draft = typeof item.draftVersion === "number" ? item.draftVersion : "нет";
  return (
    <button type="button" className="tile" onClick={() => onOpen(item.name)}>
      <span className="tile-title">{item.label}</span>
      <span className="tile-meta">{`Опубликовано: версия ${published}`}</span>
      <span className="tile-meta">{`Черновик: версия ${draft}`}</span>
      {item.hasUnpublishedChanges ? <span className="flag flag-warn">Есть неопубликованные правки</span> : null}
    </button>
  );
}

export { SectionTile };
