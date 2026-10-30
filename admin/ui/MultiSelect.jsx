import { Check } from "./Check.jsx";

/* Список флажков: можно выбрать несколько значений. */
function MultiSelect({ options = [], value = [], onChange, disabled = false }) {
  const selected = new Set(value);

  function toggle(id, checked) {
    if (checked) onChange([...value, id]);
    else onChange(value.filter((item) => item !== id));
  }

  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-auto rounded-lg border border-line p-2">
      {options.map((option) => (
        <Check
          key={option.id}
          checked={selected.has(option.id)}
          disabled={disabled}
          label={option.label}
          onChange={(checked) => toggle(option.id, checked)}
        />
      ))}
    </div>
  );
}

export { MultiSelect };
