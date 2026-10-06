import { publish } from "../backend/config/publish.js";

const SECTIONS = [
  "questionnaire",
  "catalog",
  "consultant",
  "director",
  "sales",
  "commands",
  "ai-rules"
];

const name = process.argv[2];
const description = process.argv[3];

if (!SECTIONS.includes(name)) {
  console.error(`Usage: node scripts/publish.js <name> "<description>"`);
  console.error(`name must be one of: ${SECTIONS.join(", ")}`);
  process.exit(1);
}

try {
  const result = publish(name, description);
  console.log(`Published ${name} v${result.publishedVersion} (${result.date})`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
