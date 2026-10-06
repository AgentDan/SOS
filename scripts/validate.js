import { readEnvelope } from "../backend/config/load.js";
import { validateDialogData } from "../backend/validation/index.js";

try {
  validateDialogData({
    questionnaire: readEnvelope("questionnaire"),
    catalog: readEnvelope("catalog"),
    consultant: readEnvelope("consultant"),
    director: readEnvelope("director"),
    sales: readEnvelope("sales"),
    commands: readEnvelope("commands"),
    aiRules: readEnvelope("ai-rules")
  });
  console.log("OK");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
