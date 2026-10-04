function applyConfirmation(profile, needId, optionId) {
  if (optionId === "keep") {
    profile.confirmedNeeds = [...new Set([...(profile.confirmedNeeds ?? []), needId])];
  } else if (optionId === "reject") {
    profile.rejectedNeeds = [...new Set([...(profile.rejectedNeeds ?? []), needId])];
  }
  return profile;
}

export { applyConfirmation };
