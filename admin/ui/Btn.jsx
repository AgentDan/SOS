/* Кнопка каркаса. Пока идёт работа или она выключена, нажатие ничего не делает. */
function Btn({
  kind = "default",
  size = "md",
  busy = false,
  disabled = false,
  onClick,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const look =
    kind === "primary"
      ? "border border-accent bg-accent text-white focus-visible:outline-ink"
      : kind === "danger"
        ? "border border-bad bg-bad-soft text-bad focus-visible:outline-bad"
        : "border border-line bg-surface text-ink focus-visible:outline-accent";
  const pad = size === "sm" ? "px-2.5 py-1 text-sm" : "px-3 py-2 text-base";
  return (
    <button
      {...rest}
      type={type}
      className={`cursor-pointer rounded-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${pad} ${look} ${className}`}
      disabled={busy || disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export { Btn };
