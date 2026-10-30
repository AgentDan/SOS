/* Короткая капсула статуса: нейтрально, хорошо, внимание или ошибка. */
function Pill({ tone = "neutral", className = "", children }) {
  const tones = {
    neutral: "bg-side text-muted",
    ok: "bg-accent-soft text-accent",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad"
  };
  const look = tones[tone] || tones.neutral;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${look} ${className}`}>
      {children}
    </span>
  );
}

export { Pill };
