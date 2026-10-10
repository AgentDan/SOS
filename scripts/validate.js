import { readKnobs } from "../backend/config/load.js";
import { loadSections, toDialogData } from "../backend/admin-api/sections.js";
import { validateDialogData } from "../backend/validation/index.js";
import { validateKnobs } from "../backend/validation/knobs.js";

try {
  const sections = loadSections();
  validateDialogData(toDialogData(sections));
  validateKnobs(readKnobs(), sections);
  console.log("OK");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
