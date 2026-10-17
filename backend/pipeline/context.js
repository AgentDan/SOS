import { readCatalog, readCommands, readConsultant, readQuestionnaire } from "../config/load.js";
import { loadProfile } from "../profile/profile-store.js";
import { buildVocabulary } from "./vocabulary.js";

function buildContext(clientId) {
  const catalog = readCatalog();
  const commands = readCommands();
  return {
    clientId,
    questionnaire: readQuestionnaire(),
    catalog,
    profile: loadProfile(clientId),
    vocabulary: buildVocabulary({
      commands,
      consultant: readConsultant(),
      catalog
    }),
    limits: commands.limits ?? {}
  };
}

export { buildContext };
