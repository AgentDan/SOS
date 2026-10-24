const HANDS = new Set(["right", "left"]);

function questionsOf(questionnaire) {
  const questions = questionnaire?.questions ?? questionnaire?.draft?.questions;
  return Array.isArray(questions) ? questions : [];
}

function statedHeight(profile, questionnaire) {
  const optionId = profile?.fields?.q_height?.value;
  if (typeof optionId !== "string" || optionId.length === 0) return null;
  const question = questionsOf(questionnaire).find((item) => item && item.id === "q_height");
  const options = Array.isArray(question?.options) ? question.options : [];
  const option = options.find((item) => item && item.id === optionId);
  if (!option || !Number.isInteger(option.heightCm)) return null;
  return option.heightCm;
}

function statedHand(profile) {
  const value = profile?.fields?.q_hand?.value;
  return HANDS.has(value) ? value : null;
}

function getBody({ profile, questionnaire, ergonomics }) {
  const defaults = ergonomics?.defaults ?? {};
  const heightCm = statedHeight(profile, questionnaire);
  const hand = statedHand(profile);
  return {
    heightCm: heightCm ?? defaults.heightCm,
    hand: hand ?? defaults.hand,
    source: {
      height: heightCm === null ? "assumed" : "stated",
      hand: hand === null ? "assumed" : "stated"
    }
  };
}

export { getBody };
