import { useEffect, useRef, useState } from "react";
import { fetchNext, postAnswer } from "../api/dialog-api.js";

const panelClass =
  "pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee] [&_button]:mt-1.5 [&_button]:block [&_button]:w-full [&_button]:cursor-pointer [&_button]:px-2.5 [&_button]:py-2 [&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-2";

function QuestionPanel({ clientId, onAnswered }) {
  const [view, setView] = useState(null);
  const onAnsweredRef = useRef(onAnswered);
  const aliveRef = useRef(true);
  onAnsweredRef.current = onAnswered;

  useEffect(() => {
    aliveRef.current = true;
    let alive = true;
    fetchNext(clientId)
      .then((data) => {
        if (!alive) return;
        setView(data.question ? { question: data.question } : { done: true });
      })
      .catch((err) => {
        if (!alive) return;
        console.error("Question panel failed:", err);
      });
    return () => {
      alive = false;
      aliveRef.current = false;
    };
  }, [clientId]);

  async function pick(optionId) {
    const question = view && view.question;
    if (!question) return;
    try {
      await postAnswer(clientId, question.id, optionId);
      if (!aliveRef.current) return;
      if (typeof onAnsweredRef.current === "function") await onAnsweredRef.current();
      if (!aliveRef.current) return;
      const data = await fetchNext(clientId);
      if (!aliveRef.current) return;
      setView(data.question ? { question: data.question } : { done: true });
    } catch (err) {
      if (!aliveRef.current) return;
      console.error("Question panel failed:", err);
    }
  }

  if (!view) return <div id="question-panel" className={panelClass} />;
  if (view.done) {
    return (
      <div id="question-panel" className={panelClass}>
        <p>Анкета пройдена</p>
      </div>
    );
  }

  return (
    <div id="question-panel" className={panelClass}>
      <p>{view.question.textFallback}</p>
      {(view.question.options ?? []).map((option) => (
        <button key={option.id} type="button" onClick={() => pick(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { panelClass, QuestionPanel };
