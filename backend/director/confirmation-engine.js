function getPendingConfirmations(profile) {
  const needs = Array.isArray(profile?.needs) ? profile.needs : [];
  const confirmed = new Set(profile?.confirmedNeeds ?? []);
  const rejected = new Set(profile?.rejectedNeeds ?? []);

  return needs
    .filter((need) => {
      if (!need || need.confidence === "high") return false;
      if (need.resolvedSku == null) return false;
      if (confirmed.has(need.id) || rejected.has(need.id)) return false;
      return true;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function buildConfirmationQuestion(need, catalog) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  const product = products.find((item) => item.sku === need.resolvedSku);
  const productName = product?.name ?? need.resolvedSku;

  return {
    id: `confirm_${need.id}`,
    phase: "confirmation",
    textFallback: `Я предположил: ${productName}. Оставить?`,
    type: "single",
    options: [
      { id: "keep", label: "Да, оставить" },
      { id: "reject", label: "Нет, убрать" }
    ]
  };
}

export { getPendingConfirmations, buildConfirmationQuestion };
