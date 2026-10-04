import { saveProfile } from "../profile/profile-store.js";

function persistTurn(result) {
  if (result.status === 200) saveProfile(result.profile);
}

export { persistTurn };
