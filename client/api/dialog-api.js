async function fetchNext(clientId) {
  const res = await fetch(`/api/dialog/next?clientId=${encodeURIComponent(clientId)}`);
  if (!res.ok) throw new Error(`GET /api/dialog/next failed: ${res.status}`);
  return res.json();
}

async function postAnswer(clientId, questionId, optionId) {
  const res = await fetch("/api/dialog/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, questionId, optionId })
  });
  if (!res.ok) throw new Error(`POST /api/dialog/answer failed: ${res.status}`);
  return res.json();
}

async function sendMessage(clientId, text) {
  const res = await fetch("/api/dialog/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, text })
  });
  if (!res.ok) throw new Error(`POST /api/dialog/message failed: ${res.status}`);
  return res.json();
}

async function fetchScene(clientId) {
  const res = await fetch(`/api/dialog/scene?clientId=${encodeURIComponent(clientId)}`);
  if (!res.ok) throw new Error(`GET /api/dialog/scene failed: ${res.status}`);
  return res.json();
}

export { fetchNext, postAnswer, sendMessage, fetchScene };
