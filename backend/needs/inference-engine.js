const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

function computeNeeds(questionnaire, profile) {
  const fields = profile?.fields ?? {};
  const previous = Array.isArray(profile?.needs) ? profile.needs : [];
  const previousSku = new Map(
    previous
      .filter((need) => need && need.id && need.resolvedSku != null)
      .map((need) => [need.id, need.resolvedSku])
  );

  const byNeed = new Map();

  for (const rule of questionnaire?.inference ?? questionnaire?.draft?.inference ?? []) {
    if (fields[rule.when?.questionId]?.value !== rule.when?.optionId) continue;

    const existing = byNeed.get(rule.resultNeed);
    const nextRank = CONFIDENCE_RANK[rule.confidence] ?? 0;
    const prevRank = existing ? CONFIDENCE_RANK[existing] ?? 0 : 0;
    if (!existing || nextRank > prevRank) {
      byNeed.set(rule.resultNeed, rule.confidence);
    }
  }

  const rejected = new Set(profile?.rejectedNeeds ?? []);

  return [...byNeed.entries()]
    .filter(([id]) => !rejected.has(id))
    .map(([id, confidence]) => ({
      id,
      confidence,
      resolvedSku: previousSku.get(id) ?? null
    }));
}

export { computeNeeds };
