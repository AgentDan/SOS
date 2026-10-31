import { controlClass } from "./control.js";

const invalidClass =
  "w-full rounded-lg border border-bad bg-bad-soft px-2.5 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad disabled:cursor-not-allowed disabled:opacity-60";

/* Выпадающий список. invalid подсвечивает поле, если значение не прошло проверку. */
function Select({ className = "", invalid = false, children, ...rest }) {
  return (
    <select className={`${invalid ? invalidClass : controlClass} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export { Select };
