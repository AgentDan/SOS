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
        console.error("deskOS failed to start:", err);
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
      {panel ? <QuestionPanel clientId={clientId} onAnswered={refreshScene} /> : <div id="question-panel" />}
    </>
  );
}

export { App };
