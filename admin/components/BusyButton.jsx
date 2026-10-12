function BusyButton({
  busy = false,
  disabled = false,
  type = "button",
  className = "border-line bg-surface",
  onClick,
  children
}) {
  return (
    <button
      type={type}
      className={`cursor-pointer rounded-lg border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      disabled={busy || disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export { BusyButton };
