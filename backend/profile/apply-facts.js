function applyFact(profile, questionId, optionId) {
  profile.fields[questionId] = {
    value: optionId,
    source: "stated",
    confidence: "high"
  };
  return profile;
}

export { applyFact };
