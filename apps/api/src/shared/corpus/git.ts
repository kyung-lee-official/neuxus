import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { StoredCorpusSettings } from "./defaults.ts";
import { loadCorpusSettings, saveCorpusLastSyncedSha } from "./settings.ts";

const GIT_TIMEOUT_MS = 120_000;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

export class CorpusGitError extends Error {
  readonly httpStatus: 400 | 409 | 500;

  constructor(httpStatus: 400 | 409 | 500, message: string) {
    super(message);
    this.name = "CorpusGitError";
    this.httpStatus = httpStatus;
  }
}

/** Local checkout of `kb_corpus_settings` (`apps/api/data/corpus`). */
export function corpusCheckoutDir(): string {
  return join(import.meta.dir, "../../../data/corpus");
}

function gitDir(checkout: string): string {
  return join(checkout, ".git");
}

function assertSafeGitArg(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new CorpusGitError(400, `${label} must not start with -`);
  }
}

function assertSafeBranch(branch: string): void {
  assertSafeGitArg(branch, "branch");
  if (!BRANCH_PATTERN.test(branch)) {
    throw new CorpusGitError(400, "branch contains unsupported characters");
  }
}

function redact(text: string): string {
  return text
    .replace(/https?:\/\/[^/\s]+@/gi, "https://***@")
    .replace(/git@[^:\s]+/gi, "git@***")
    .trim();
}

async function runGit(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      signal: AbortSignal.timeout(GIT_TIMEOUT_MS),
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    return { stdout, stderr, code };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new CorpusGitError(500, "git timed out");
    }
    throw err;
  }
}

async function requireHeadSha(checkout: string): Promise<string> {
  const result = await runGit(["rev-parse", "HEAD"], checkout);
  if (result.code !== 0) {
    throw new CorpusGitError(
      500,
      redact(result.stderr) || "Could not read HEAD",
    );
  }
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new CorpusGitError(500, "Unexpected git HEAD output");
  }
  return sha;
}

async function requireRepoUrl(): Promise<
  StoredCorpusSettings & { repoUrl: string }
> {
  const settings = await loadCorpusSettings();
  if (!settings.repoUrl) {
    throw new CorpusGitError(400, "Save a repo URL first.");
  }
  assertSafeGitArg(settings.repoUrl, "repo URL");
  if (settings.branch) assertSafeBranch(settings.branch);
  return { ...settings, repoUrl: settings.repoUrl };
}

export async function cloneCorpus(): Promise<StoredCorpusSettings> {
  const settings = await requireRepoUrl();
  const checkout = corpusCheckoutDir();
  if (existsSync(gitDir(checkout))) {
    throw new CorpusGitError(409, "Already cloned. Use Pull.");
  }
  if (existsSync(checkout)) {
    throw new CorpusGitError(
      409,
      "Checkout path exists but is not a git repo.",
    );
  }

  await mkdir(join(checkout, ".."), { recursive: true });
  const args = ["clone"];
  if (settings.branch) {
    args.push("--branch", settings.branch, "--single-branch");
  }
  const repoUrl = settings.repoUrl;
  args.push(repoUrl, checkout);
  const result = await runGit(args);
  if (result.code !== 0) {
    if (existsSync(checkout) && !existsSync(gitDir(checkout))) {
      await rm(checkout, { recursive: true, force: true });
    }
    throw new CorpusGitError(500, redact(result.stderr) || "git clone failed");
  }
  const sha = await requireHeadSha(checkout);
  return saveCorpusLastSyncedSha(sha);
}

export async function pullCorpus(): Promise<StoredCorpusSettings> {
  const settings = await requireRepoUrl();
  const checkout = corpusCheckoutDir();
  if (!existsSync(gitDir(checkout))) {
    throw new CorpusGitError(400, "Not cloned yet. Use Clone.");
  }

  const fetch = await runGit(["fetch", "origin"], checkout);
  if (fetch.code !== 0) {
    throw new CorpusGitError(500, redact(fetch.stderr) || "git fetch failed");
  }
  if (settings.branch) {
    const checkoutBranch = await runGit(
      ["checkout", settings.branch],
      checkout,
    );
    if (checkoutBranch.code !== 0) {
      throw new CorpusGitError(
        500,
        redact(checkoutBranch.stderr) || "git checkout failed",
      );
    }
  }
  const pull = await runGit(["pull", "--ff-only"], checkout);
  if (pull.code !== 0) {
    throw new CorpusGitError(500, redact(pull.stderr) || "git pull failed");
  }
  const sha = await requireHeadSha(checkout);
  return saveCorpusLastSyncedSha(sha);
}
