import { readCatalog, readCommands, readConsultant, readQuestionnaire } from "../config/load.js";
import { loadProfile } from "../profile/profile-store.js";
import { buildVocabulary } from "./vocabulary.js";

function buildContext(clientId) {
  const catalog = readCatalog();
  const commands = readCommands();
  const consultant = readConsultant();
  return {
    clientId,
    questionnaire: readQuestionnaire(),
    catalog,
    consultant,
    profile: loadProfile(clientId),
    vocabulary: buildVocabulary({
      commands,
      consultant,
      catalog
    }),
    limits: commands.limits ?? {}
  };
}

export { buildContext };
