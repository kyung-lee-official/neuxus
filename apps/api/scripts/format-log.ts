/**
 * Pretty-print one `app_log` row by id. Newlines in strings are
 * preserved, sections are labeled, the full request body is dumped
 * as indented JSON, and top-K hits are listed with score + full text.
 *
 * Usage:
 *   bun --env-file=../../.env run scripts/format-log.ts <log-id>
 *
 * Example:
 *   bun --env-file=../../.env run scripts/format-log.ts 377
 */
import { sql } from "bun";

const logId = process.argv[2];
if (!logId) {
  console.error(
    "usage: bun --env-file=../../.env run scripts/format-log.ts <log-id>",
  );
  process.exit(1);
}

const rows = await sql<
  Array<{
    id: bigint;
    level: string;
    name: string | null;
    msg: string;
    meta: Record<string, unknown> | null;
    created_at: Date;
  }>
>`
  SELECT id, level, name, msg, meta, created_at
  FROM app_log
  WHERE id = ${BigInt(logId)}
  LIMIT 1
`;

if (rows.length === 0) {
  console.error(`log id ${logId} not found`);
  process.exit(1);
}

const r = rows[0]!;
const m = (r.meta ?? {}) as Record<string, unknown>;

function hr(title: string) {
  console.log();
  console.log("─".repeat(72));
  console.log(`# ${title}`);
  console.log("─".repeat(72));
}

function dump(label: string, value: unknown) {
  hr(label);
  if (value == null) {
    console.log("(none)");
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function showKeyValue(key: string, value: unknown) {
  if (value == null) return;
  console.log(`# ${key}: ${String(value)}`);
}

console.log("=".repeat(72));
console.log(
  `# log ${r.id}  ·  ${r.level.toUpperCase()}  ·  ${r.name ?? "—"}  ·  ${r.created_at.toISOString()}`,
);
console.log("=".repeat(72));
console.log(`# msg: ${r.msg}`);

// --- synthesis-shaped fields -----------------------------------------
showKeyValue("model", m.model);
showKeyValue("provider", m.provider);
showKeyValue("maxTokens", m.maxTokens);
showKeyValue("temperature", m.temperature);
showKeyValue("promptChars", m.promptChars);
showKeyValue("status", m.status);

if (typeof m.latencyMs === "number") {
  console.log(`# latencyMs: ${m.latencyMs}`);
}

if (typeof m.system === "string") {
  dump("REQUEST.system (Anthropic 'system' prompt)", m.system);
}
if (typeof m.prompt === "string") {
  dump("USER prompt (the fitted string actually sent)", m.prompt);
}
if (m.request && typeof m.request === "object") {
  dump("REQUEST (full body JSON sent to LLM)", m.request);
}
if (typeof m.response === "string") {
  dump("RESPONSE (raw assistant text)", m.response);
}
if (typeof m.error === "string") {
  dump("ERROR", m.error);
}

// --- retrieve-shaped fields ------------------------------------------
showKeyValue("embeddingModel", m.embeddingModel);
showKeyValue("childLimit", m.childLimit);
if (typeof m.question === "string") {
  dump("QUESTION (after trim)", m.question);
}
if (Array.isArray(m.topK) && m.topK.length > 0) {
  hr("TOP-K (raw hits from cosine scan, in score order)");
  for (const hit of m.topK as Array<Record<string, unknown>>) {
    const score = typeof hit.score === "number" ? hit.score.toFixed(4) : "?";
    const pageId = String(hit.pageId ?? "?");
    const parentId = String(hit.parentId ?? "?");
    const childId = String(hit.childId ?? "?");
    console.log(`#  score=${score}  childId=${childId}  parentId=${parentId}`);
    console.log(`#  pageId=${pageId}`);
    if (typeof hit.text === "string" && hit.text.length > 0) {
      console.log("#  text:");
      for (const line of hit.text.split("\n")) {
        console.log(`     ${line}`);
      }
    }
    console.log();
  }
}

// --- anything else in meta, unrendered -------------------------------
const known = new Set([
  "model",
  "provider",
  "maxTokens",
  "temperature",
  "promptChars",
  "status",
  "latencyMs",
  "system",
  "prompt",
  "request",
  "response",
  "error",
  "embeddingModel",
  "childLimit",
  "question",
  "topK",
]);
const extraKeys = Object.keys(m).filter((k) => !known.has(k));
if (extraKeys.length > 0) {
  const rest: Record<string, unknown> = {};
  for (const k of extraKeys) rest[k] = m[k];
  dump("OTHER meta fields (raw JSON)", rest);
}

console.log();
console.log("=".repeat(72));
console.log(`# end of log ${r.id}`);
console.log("=".repeat(72));

process.exit(0);
