import { readFile } from "node:fs/promises";

const [reportPath, rawExitCode, exceptionsPath] = process.argv.slice(2);

if (!reportPath || rawExitCode === undefined || !exceptionsPath) {
  console.error(
    "Usage: classify-npm-audit.mjs <report.json> <audit-exit-code> <exceptions.json>",
  );
  process.exit(2);
}

let report;
let exceptionRecords;

async function readJson(path) {
  if (path !== "-") {
    return JSON.parse(await readFile(path, "utf8"));
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

try {
  report = await readJson(reportPath);
  exceptionRecords = await readJson(exceptionsPath);
} catch {
  console.error(
    "::error title=npm audit unavailable::The npm audit report or exception registry was missing or invalid. Treat this as a registry, configuration, or audit-tool failure.",
  );
  process.exit(2);
}

if (!Array.isArray(exceptionRecords)) {
  console.error(
    "::error title=Invalid audit exceptions::The dependency exception registry must be a JSON array.",
  );
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const npmExceptions = new Set();

for (const exception of exceptionRecords.filter(
  (item) => item?.ecosystem === "npm",
)) {
  const requiredFields = [
    "id",
    "owner",
    "rationale",
    "mitigation",
    "expires",
  ];

  if (requiredFields.some((field) => !exception[field])) {
    console.error(
      `::error title=Invalid audit exception::The npm exception ${exception.id ?? "<unknown>"} is incomplete.`,
    );
    process.exit(2);
  }

  if (exception.expires < today) {
    console.error(
      `::error title=Expired audit exception::The npm exception ${exception.id} expired on ${exception.expires}.`,
    );
    process.exit(2);
  }

  npmExceptions.add(exception.id);
}

if (report.error) {
  const code = typeof report.error.code === "string" ? report.error.code : "UNKNOWN";
  console.error(
    `::error title=npm audit unavailable::The registry or audit service returned ${code}. No vulnerability conclusion can be drawn.`,
  );
  process.exit(2);
}

const vulnerabilities = report.metadata?.vulnerabilities;

if (!vulnerabilities || typeof vulnerabilities !== "object") {
  console.error(
    "::error title=npm audit unavailable::The registry returned an unexpected audit payload. No vulnerability conclusion can be drawn.",
  );
  process.exit(2);
}

const high = Number(vulnerabilities.high ?? 0);
const critical = Number(vulnerabilities.critical ?? 0);
const total = Number(vulnerabilities.total ?? 0);

console.log(
  `npm audit summary: ${total} total, ${high} high, ${critical} critical.`,
);

const packageReports =
  report.vulnerabilities && typeof report.vulnerabilities === "object"
    ? report.vulnerabilities
    : {};

function collectAdvisories(packageName, visited = new Set()) {
  if (visited.has(packageName)) {
    return [];
  }
  visited.add(packageName);

  const packageReport = packageReports[packageName];
  if (!packageReport || !Array.isArray(packageReport.via)) {
    return [];
  }

  return packageReport.via.flatMap((via) => {
    if (typeof via === "string") {
      return collectAdvisories(via, visited);
    }
    return via && typeof via === "object" ? [via] : [];
  });
}

const advisories = new Map();

for (const packageName of Object.keys(packageReports)) {
  for (const advisory of collectAdvisories(packageName)) {
    const urlId =
      typeof advisory.url === "string"
        ? advisory.url.split("/").filter(Boolean).at(-1)
        : undefined;
    const id = urlId ?? String(advisory.source ?? advisory.name ?? "unknown");
    advisories.set(id, { ...advisory, id });
  }
}

const blockingAdvisories = [...advisories.values()].filter(
  (advisory) =>
    ["high", "critical"].includes(String(advisory.severity).toLowerCase()) &&
    !npmExceptions.has(advisory.id),
);
const ignoredAdvisories = [...advisories.values()].filter((advisory) =>
  npmExceptions.has(advisory.id),
);

for (const advisory of ignoredAdvisories) {
  console.log(
    `Temporarily excepted npm advisory ${advisory.id}; see ${exceptionsPath}.`,
  );
}

if (blockingAdvisories.length > 0) {
  const identifiers = blockingAdvisories
    .map((advisory) => advisory.id)
    .join(", ");
  console.error(
    `::error title=Frontend vulnerabilities detected::npm audit confirmed blocking advisories: ${identifiers}.`,
  );
  process.exit(1);
}

if (Number(rawExitCode) !== 0 && ignoredAdvisories.length === 0) {
  console.error(
    "::error title=npm audit failed::The audit command failed without reporting a high or critical vulnerability.",
  );
  process.exit(2);
}
