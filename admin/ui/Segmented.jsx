/* Переключатель вкладок. Стрелки влево и вправо меняют выбранную вкладку. */
function Segmented({ label, items = [], value, onChange, className = "", disabled = false }) {
  function onKeyDown(event) {
    if (disabled) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || tabs.length === 0) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + tabs.length) % tabs.length;
    onChange(items[next].id);
    tabs[next].focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-side p-0.5 ${className}`}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={disabled ? -1 : selected ? 0 : -1}
            disabled={disabled}
            className={
              selected
                ? "cursor-pointer rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                : "cursor-pointer rounded-md bg-transparent px-3 py-1.5 text-sm text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            }
            onClick={() => {
              if (!disabled) onChange(item.id);
            }}
          >
            {item.text}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
