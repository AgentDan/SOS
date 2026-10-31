function confirmAction(message) {
  return window.confirm(message);
}

function ConfirmButton({ message, disabled = false, className, onConfirm, children }) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className || ""}`}
      disabled={disabled}
      onClick={() => {
        const text = typeof message === "function" ? message() : message;
        if (confirmAction(text)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}

export { confirmAction, ConfirmButton };
