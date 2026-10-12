import { useEffect, useRef, useState } from "react";
import { fetchNext, postAnswer } from "../api/dialog-api.js";

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

  if (!view) {
    return (
      <div
        id="question-panel"
        className="pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee]"
      />
    );
  }
  if (view.done) {
    return (
      <div
        id="question-panel"
        className="pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee]"
      >
        <p className="mx-0 mt-0 mb-2">Анкета пройдена</p>
      </div>
    );
  }

  return (
    <div
      id="question-panel"
      className="pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee]"
    >
      <p className="mx-0 mt-0 mb-2">{view.question.textFallback}</p>
      {(view.question.options ?? []).map((option) => (
        <button
          key={option.id}
          type="button"
          className="mt-1.5 block w-full cursor-pointer px-2.5 py-2"
          onClick={() => pick(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { QuestionPanel };
