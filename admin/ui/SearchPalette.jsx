import { useEffect, useId, useRef, useState } from "react";
import { Btn } from "./Btn.jsx";
import { controlClass } from "./control.js";

/* Окно поиска: поле, группы результатов и переход с клавиатуры. */
const MARK = {
  screen: "Экран",
  product: "Товар",
  question: "Вопрос",
  option: "Ответ",
  need: "Потребность",
  type: "Тип",
  scenario: "Сценарий"
};

function kindMark(kind) {
  return MARK[kind] || "Запись";
}

function flatten(groups) {
  const items = [];
  for (const group of groups) {
    const rows = group && Array.isArray(group.items) ? group.items : [];
    for (const item of rows) items.push(item);
  }
  return items;
}

function SearchPalette({ query, onQuery, groups = [], loading = false, error = false, onRetry, onClose, onPick }) {
  const titleId = useId();
  const listId = useId();
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const items = flatten(groups);
  const signature = items.map((item) => (item && item.id) || "").join("\n");
  const [seen, setSeen] = useState(signature);
  const [active, setActive] = useState(0);
  let current = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  if (seen !== signature) {
    setSeen(signature);
    setActive(0);
    current = items.length === 0 ? -1 : 0;
  }
  const activeId = current >= 0 ? `${listId}-opt-${current}` : undefined;
  const emptyQuery = query.trim().length === 0;

  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const node = document.getElementById(activeId);
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const start = current < 0 ? 0 : current;
      setActive((start + step + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      if (event.isComposing) return;
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (current >= 0 && items[current]) onPick(items[current]);
      return;
    }
    if (event.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = [...root.querySelectorAll("input, button, a[href]")].filter(
      (node) => !node.disabled && node.tabIndex >= 0
    );
    if (focusable.length === 0) return;
    event.preventDefault();
    const index = focusable.indexOf(document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    const next = index < 0 ? 0 : (index + step + focusable.length) % focusable.length;
    focusable[next].focus();
  }

  let cursor = 0;

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto mt-[10vh] flex max-h-[calc(100vh-6rem)] w-[min(40rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          Поиск
        </h2>
        <div className="border-b border-line p-3">
          <input
            ref={inputRef}
            className={controlClass}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            placeholder="Товар, вопрос, потребность…"
            autoComplete="off"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          {emptyQuery ? (
            <p className="mt-2 mb-0 text-sm text-muted">Наберите слово или выберите экран</p>
          ) : null}
        </div>
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2" role="alert">
            <p className="m-0 text-sm text-bad">Не удалось загрузить данные для поиска</p>
            <Btn size="sm" onClick={onRetry}>
              Повторить
            </Btn>
          </div>
        ) : null}
        {loading ? <p className="m-0 border-b border-line px-3 py-2 text-sm text-muted">Загрузка…</p> : null}
        <div id={listId} role="listbox" aria-label="Результаты поиска" className="min-h-0 flex-1 overflow-y-auto p-1">
          {items.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-muted">{emptyQuery ? "Экранов нет" : "Ничего не найдено"}</p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} role="group" aria-label={group.title}>
                <p className="m-0 px-3 pt-3 pb-1 text-xs font-medium text-muted">{group.title}</p>
                {group.items.map((item) => {
                  const index = cursor;
                  cursor += 1;
                  const selected = index === current;
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-opt-${index}`}
                      role="option"
                      aria-selected={selected}
                      className={
                        selected
                          ? "flex cursor-pointer items-baseline gap-3 rounded-lg bg-accent-soft px-3 py-2"
                          : "flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2"
                      }
                      onMouseEnter={() => setActive(index)}
                      onClick={() => onPick(item)}
                    >
                      <span className="w-28 shrink-0 text-xs text-muted">{kindMark(item.kind)}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint ? <span className="max-w-[40%] truncate text-xs text-muted">{item.hint}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { SearchPalette };
