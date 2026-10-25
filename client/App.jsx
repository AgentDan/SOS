import { useCallback, useEffect, useState } from "react";
import { fetchScene, readScene } from "./api/dialog-api.js";
import { MessageInput } from "./chat/MessageInput.jsx";
import { QuestionPanel } from "./chat/QuestionPanel.jsx";
import { ReplyBox } from "./chat/ReplyBox.jsx";
import { SceneView } from "./scene/SceneView.jsx";
import { getClientId } from "./session/client-id.js";

function App() {
  const clientId = getClientId();
  const [scene, setScene] = useState(null);
  const [showPerson, setShowPerson] = useState(false);
  const [panel, setPanel] = useState(false);
  const [reply, setReply] = useState("");

  const remember = useCallback((data) => {
    const next = readScene(data);
    setScene(next);
    if (next.person == null) setShowPerson(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchScene(clientId)
      .then((data) => {
        if (!alive) return;
        remember(data);
      })
      .catch((err) => {
        console.error("SOS failed to start:", err);
        if (alive) setPanel(true);
      });
    return () => {
      alive = false;
    };
  }, [clientId, remember]);

  const refreshScene = useCallback(async () => {
    const data = await fetchScene(clientId);
    remember(data);
  }, [clientId, remember]);

  const onSent = useCallback(
    (response) => {
      const text = typeof response?.reply?.text === "string" ? response.reply.text : "";
      remember(response?.scene);
      setReply(text);
    },
    [remember]
  );

  const person = scene?.person ?? null;

  return (
    <>
      <SceneView
        skus={scene ? scene.skus : null}
        placements={scene ? scene.placements : null}
        person={person}
        showPerson={showPerson && person != null}
        onReady={() => setPanel(true)}
      />
      {person ? (
        <button type="button" className="scene-person" onClick={() => setShowPerson((on) => !on)}>
          {showPerson ? "Скрыть манекена" : "Показать манекена"}
        </button>
      ) : null}
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
