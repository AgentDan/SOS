import { cloneElement, isValidElement, useId } from "react";

/* Подпись и подсказка, связанные с полем ввода.
   before — ползунок слева от поля, между подписью и самим полем. */
function Field({ label, hint, before = null, className = "", children }) {
  const autoId = useId();
  const childId = isValidElement(children) && children.props.id ? children.props.id : autoId;
  const hintId = hint ? `${autoId}-hint` : undefined;
  const described = [isValidElement(children) ? children.props["aria-describedby"] : "", hintId]
    .filter(Boolean)
    .join(" ");
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: childId,
        "aria-describedby": described || undefined
      })
    : children;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={childId} className="text-sm font-medium text-ink">
        {label}
      </label>
      {before ? (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3">
          {before}
          {control}
        </div>
      ) : (
        control
      )}
      {hint ? (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
