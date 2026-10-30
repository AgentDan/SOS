import { cloneElement, isValidElement, useId } from "react";

/* Подпись и подсказка, связанные с полем ввода. */
function Field({ label, hint, className = "", children }) {
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
      {control}
      {hint ? (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
