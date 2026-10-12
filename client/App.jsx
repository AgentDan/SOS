import { useCallback, useEffect, useState } from "react";
import { fetchScene } from "./api/dialog-api.js";
import { QuestionPanel } from "./chat/QuestionPanel.jsx";
import { SceneView } from "./scene/SceneView.jsx";
import { getClientId } from "./session/client-id.js";

function App() {
  const clientId = getClientId();
  const [skus, setSkus] = useState(null);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchScene(clientId)
      .then((data) => {
        if (!alive) return;
        setSkus(Array.isArray(data?.skus) ? data.skus : []);
      })
      .catch((err) => {
        console.error("SOS failed to start:", err);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  const refreshScene = useCallback(async () => {
    const data = await fetchScene(clientId);
    setSkus(Array.isArray(data?.skus) ? data.skus : []);
  }, [clientId]);

  return (
    <>
      <SceneView skus={skus} onReady={() => setPanel(true)} />
      {panel ? (
        <QuestionPanel clientId={clientId} onAnswered={refreshScene} />
      ) : (
        <div
          id="question-panel"
          className="pointer-events-auto absolute top-4 left-4 z-10 max-w-[280px] rounded-lg bg-[#121212]/90 px-[14px] py-3 font-[system-ui,_sans-serif] text-[14px] leading-[1.4] text-[#eee]"
        />
      )}
    </>
  );
}

export { App };
