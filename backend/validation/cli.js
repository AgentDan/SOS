import {
  readAiRules,
  readCatalog,
  readCommands,
  readConsultant,
  readDirector,
  readQuestionnaire,
  readSales
} from "../config/load.js";
import { validateDialogData } from "./index.js";

try {
  validateDialogData({
    questionnaire: readQuestionnaire(),
    catalog: readCatalog(),
    consultant: readConsultant(),
    director: readDirector(),
    sales: readSales(),
    commands: readCommands(),
    aiRules: readAiRules()
  });
  console.log("OK");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
