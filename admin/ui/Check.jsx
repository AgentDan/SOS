/* Флажок с подписью. */
function Check({ checked, onChange, disabled = false, label }) {
  return (
    <label className="flex items-center gap-2 text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/* Переключатель в таблице: подпись читает только вспомогательная техника. */
function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      className="h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
      checked={checked === true}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export { Check, Switch };
