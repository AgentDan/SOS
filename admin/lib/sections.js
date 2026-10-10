const SECTIONS = [
  ["questionnaire", "Анкета"],
  ["catalog", "Каталог"],
  ["consultant", "Консультант"],
  ["director", "Режиссёр"],
  ["sales", "Продажа"],
  ["commands", "Команды сцены"],
  ["ai-rules", "Правила AI"]
];

const SECTION_LABELS = Object.fromEntries(SECTIONS);

function sectionLabel(name) {
  if (typeof name !== "string" || name.length === 0) return "Раздел";
  return SECTION_LABELS[name] || name;
}

function labelSections(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      name: item.name,
      label: sectionLabel(item.name),
      draftVersion: item.draftVersion,
      publishedVersion: item.publishedVersion,
      hasUnpublishedChanges: Boolean(item.hasUnpublishedChanges)
    }));
}

export { SECTIONS, SECTION_LABELS, sectionLabel, labelSections };
