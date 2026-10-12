function BusyButton({
  busy = false,
  disabled = false,
  type = "button",
  className = "border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b]",
  onClick,
  children
}) {
  return (
    <button
      type={type}
      className={`cursor-pointer rounded-lg border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e] ${className}`}
      disabled={busy || disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export { BusyButton };
