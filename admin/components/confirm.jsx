function confirmAction(message) {
  return window.confirm(message);
}

function ConfirmButton({ message, disabled = false, className, onConfirm, children }) {
  return (
    <button
      type="button"
      className={className}
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
