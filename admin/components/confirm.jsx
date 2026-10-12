function confirmAction(message) {
  return window.confirm(message);
}

function ConfirmButton({ message, disabled = false, className, onConfirm, children }) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e] ${className || ""}`}
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
