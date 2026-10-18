import { useCallback, useEffect, useRef, useState } from "react";
import { fetchScene } from "./api/dialog-api.js";
import { MessageInput } from "./chat/MessageInput.jsx";
import { QuestionPanel } from "./chat/QuestionPanel.jsx";
import { ReplyBox } from "./chat/ReplyBox.jsx";
import { SceneView } from "./scene/SceneView.jsx";
import { getClientId } from "./session/client-id.js";

function App() {
  const clientId = getClientId();
  const [skus, setSkus] = useState(null);
  const [panel, setPanel] = useState(false);
  const [reply, setReply] = useState("");
  const [distanceToken, setDistanceToken] = useState(0);
  const [measure, setMeasure] = useState(null);
  const pendingRef = useRef(null);

  const showSkus = useCallback((list) => {
    setSkus(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchScene(clientId)
      .then((data) => {
        if (!alive) return;
        showSkus(data?.skus);
      })
      .catch((err) => {
        console.error("SOS failed to start:", err);
        if (alive) setPanel(true);
      });
    return () => {
      alive = false;
    };
  }, [clientId, showSkus]);

  const refreshScene = useCallback(async () => {
    const data = await fetchScene(clientId);
    showSkus(data?.skus);
  }, [clientId, showSkus]);

  const onDistance = useCallback((event) => {
    const pending = pendingRef.current;
    if (!pending || !event || event.token !== pending.token) return;
    const label = event.label;
    if (typeof label === "string" && label.length > 0) {
      setReply(pending.text.split("{distance}").join(label));
      return;
    }
    const fallback = pending.fallback.trim();
    setReply(fallback || pending.text.split("{distance}").join("").replace(/\s{2,}/g, " ").trim());
  }, []);

  const onSent = useCallback(
    (response) => {
      const text = typeof response?.reply?.text === "string" ? response.reply.text : "";
      const facts = response?.result?.facts;
      const pair = facts?.measure;
      showSkus(response?.scene?.skus);
      if (
        response?.result?.ok === true &&
        facts?.action === "distance" &&
        typeof pair?.a === "string" &&
        typeof pair?.b === "string"
      ) {
        const token = distanceToken + 1;
        const fallback = response?.reply?.fallback;
        pendingRef.current = {
          token,
          text,
          fallback: typeof fallback === "string" ? fallback : ""
        };
        setMeasure({ a: pair.a, b: pair.b });
        setDistanceToken(token);
        setReply("");
        return;
      }
      pendingRef.current = null;
      setReply(text);
    },
    [distanceToken, showSkus]
  );

  return (
    <>
      <SceneView
        skus={skus}
        distanceToken={distanceToken}
        measure={measure}
        onDistance={onDistance}
        onReady={() => setPanel(true)}
      />
      {panel ? (
        <QuestionPanel clientId={clientId} onAnswered={refreshScene} />
      ) : (
        <div
          id="question-panel"
          className="pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee]"
        />
      )}
      <div className="chat-dock">
        <ReplyBox text={reply} />
        <MessageInput clientId={clientId} onSent={onSent} />
      </div>
    </>
  );
}

export { App };
