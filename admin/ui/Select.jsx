import { controlClass } from "./control.js";

/* Выпадающий список. */
function Select({ className = "", children, ...rest }) {
  return (
    <select className={`${controlClass} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export { Select };
