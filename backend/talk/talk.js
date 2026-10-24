import { runCheaper } from "./cheaper.js";
import { failTalk, okTalk } from "./result.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function consultantLayer(consultant) {
  if (consultant && (Array.isArray(consultant.faq) || isPlainObject(consultant.topics))) return consultant;
  if (consultant?.draft) return consultant.draft;
  return consultant ?? {};
}

function findFaq(layer, faqId) {
  if (typeof faqId !== "string" || faqId.length === 0) return null;
  const faq = layer?.faq;
  if (!Array.isArray(faq)) return null;
  return faq.find((entry) => entry?.id === faqId) ?? null;
}

function runTalk({ intent, catalog, consultant, scene, canReplace }) {
  const topic = intent?.payload?.topic;
  if (topic === "faq") {
    const faqId = intent?.payload?.faqId;
    const entry = findFaq(consultantLayer(consultant), faqId);
    if (!entry) {
      const facts = { topic: "faq" };
      if (typeof faqId === "string") facts.faqId = faqId;
      return failTalk({
        reasonCode: "not_found",
        facts,
        say: { code: "not_found", params: {} }
      });
    }
    return okTalk({
      sceneChanged: false,
      facts: { topic: "faq", faqId, answer: entry.answer },
      say: { code: "faq_answer", params: { faqId } }
    });
  }

  if (topic === "smalltalk") {
    return okTalk({
      sceneChanged: false,
      facts: { topic: "smalltalk" },
      say: { code: "smalltalk", params: {} }
    });
  }

  if (topic === "cheaper") return runCheaper({ catalog, scene, canReplace });

  const facts = {};
  if (topic !== undefined) facts.topic = topic;
  return failTalk({
    reasonCode: "not_implemented",
    facts,
    say: { code: "not_implemented", params: {} }
  });
}

export { runTalk };
