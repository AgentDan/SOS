function BusyButton({ busy = false, disabled = false, type = "button", className, onClick, children }) {
  return (
    <button type={type} className={className} disabled={busy || disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export { BusyButton };
