import { publish, rollback } from "../backend/config/publish.js";

const SECTIONS = [
  "questionnaire",
  "catalog",
  "consultant",
  "director",
  "sales",
  "commands",
  "ai-rules"
];

const args = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

try {
  if (args[0] === "--rollback") {
    const name = args[1];
    const version = Number(args[2]);
    if (!SECTIONS.includes(name) || !Number.isInteger(version)) {
      fail(
        `Usage: npm run publish-config -- --rollback <name> <version>\nname must be one of: ${SECTIONS.join(", ")}`
      );
    }
    const result = rollback(name, version);
    console.log(`Rolled back ${name} to v${version} as v${result.publishedVersion} (${result.date})`);
  } else {
    const name = args[0];
    const description = args[1];
    if (!SECTIONS.includes(name)) {
      fail(
        `Usage: npm run publish-config -- <name> "<description>"\n       npm run publish-config -- --rollback <name> <version>\nname must be one of: ${SECTIONS.join(", ")}`
      );
    }
    const result = publish(name, description);
    console.log(`Published ${name} v${result.publishedVersion} (${result.date})`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
