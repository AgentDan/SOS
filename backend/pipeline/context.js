import { readCatalog, readQuestionnaire } from "../config/load.js";
import { loadProfile } from "../profile/profile-store.js";

function buildContext(clientId) {
  return {
    clientId,
    questionnaire: readQuestionnaire(),
    catalog: readCatalog(),
    profile: loadProfile(clientId)
  };
}

export { buildContext };
