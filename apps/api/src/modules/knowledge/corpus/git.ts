import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type SimpleGit,
  type SimpleGitProgressEvent,
  simpleGit,
} from "simple-git";
import type { StoredCorpusSettings } from "./settings/defaults.ts";
import { CorpusSettings } from "./settings/service.ts";

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A `simple-git` instance bound to `cwd`. `GIT_TERMINAL_PROMPT=0` keeps a bad
 * credential from hanging on an interactive prompt; the block timeout bounds
 * every command. `onProgress` (clone only) enables the progress plugin.
 */
function gitFor(
  cwd?: string,
  onProgress?: (event: SimpleGitProgressEvent) => void,
): SimpleGit {
  return simpleGit({
    baseDir: cwd ?? process.cwd(),
    timeout: { block: GIT_TIMEOUT_MS },
    ...(onProgress ? { progress: onProgress } : {}),
  }).env({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
}

async function requireHeadSha(checkout: string): Promise<string> {
  let sha: string;
  try {
    sha = (await gitFor(checkout).revparse(["HEAD"])).trim();
  } catch (err) {
    throw new CorpusGitError(
      500,
      redact(errorMessage(err)) || "Could not read HEAD",
    );
  }
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new CorpusGitError(500, "Unexpected git HEAD output");
  }
  return sha;
}

async function requireRepoUrl(): Promise<
  StoredCorpusSettings & { repoUrl: string }
> {
  const settings = await CorpusSettings.load();
  if (!settings.repoUrl) {
    throw new CorpusGitError(400, "Save a repo URL first.");
  }
  assertSafeGitArg(settings.repoUrl, "repo URL");
  if (settings.branch) assertSafeBranch(settings.branch);
  return { ...settings, repoUrl: settings.repoUrl };
}

async function cloneIntoCheckout(
  settings: StoredCorpusSettings & { repoUrl: string },
  onProgress?: (event: SimpleGitProgressEvent) => void,
): Promise<void> {
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
  const args: string[] = [];
  if (settings.branch) {
    args.push("--branch", settings.branch, "--single-branch");
  }
  try {
    await gitFor(undefined, onProgress).clone(settings.repoUrl, checkout, args);
  } catch (err) {
    if (existsSync(checkout) && !existsSync(gitDir(checkout))) {
      await rm(checkout, { recursive: true, force: true });
    }
    throw new CorpusGitError(
      500,
      redact(errorMessage(err)) || "git clone failed",
    );
  }
}

async function pullInCheckout(
  settings: StoredCorpusSettings & { repoUrl: string },
  onStage?: (stage: PullStage) => void,
): Promise<void> {
  const checkout = corpusCheckoutDir();
  if (!existsSync(gitDir(checkout))) {
    throw new CorpusGitError(400, "Not cloned yet. Use Clone.");
  }

  const git = gitFor(checkout);
  try {
    onStage?.("fetch");
    await git.fetch("origin");
    if (settings.branch) {
      onStage?.("checkout");
      await git.checkout(settings.branch);
    }
    onStage?.("merge");
    await git.pull(undefined, undefined, ["--ff-only"]);
  } catch (err) {
    throw new CorpusGitError(
      500,
      redact(errorMessage(err)) || "git pull failed",
    );
  }
}

/** Clone progress the UI cares about. */
export type CloneProgress = {
  phase: "receiving" | "resolving" | "checking-out";
  percent: number;
  processed?: number;
  total?: number;
};

/** Pull stages the UI cares about. */
export type PullStage = "fetch" | "checkout" | "merge";

/** Clone, mapping git progress to the phases the UI renders. */
export async function cloneCorpusStream(
  onProgress: (progress: CloneProgress) => void,
): Promise<StoredCorpusSettings> {
  const settings = await requireRepoUrl();
  await cloneIntoCheckout(settings, (event) => {
    const phase =
      event.stage === "receiving"
        ? "receiving"
        : event.stage === "resolving"
          ? "resolving"
          : event.stage === "checking"
            ? "checking-out"
            : null;
    if (phase === null) return;
    onProgress({
      phase,
      percent: event.progress,
      processed: event.processed,
      total: event.total,
    });
  });
  const sha = await requireHeadSha(corpusCheckoutDir());
  return CorpusSettings.saveLastSyncedSha(sha);
}

/** Pull with stage transitions emitted as each git subcommand starts. */
export async function pullCorpusStream(
  onStage: (stage: PullStage) => void,
): Promise<StoredCorpusSettings> {
  const settings = await requireRepoUrl();
  await pullInCheckout(settings, onStage);
  const sha = await requireHeadSha(corpusCheckoutDir());
  return CorpusSettings.saveLastSyncedSha(sha);
}

/**
 * Clone if missing, otherwise pull. Returns HEAD; does not write
 * `last_synced_sha` (full Sync writes that after ingest + embed).
 */
export async function refreshCorpusCheckout(): Promise<string> {
  const settings = await requireRepoUrl();
  const checkout = corpusCheckoutDir();
  if (existsSync(gitDir(checkout))) {
    await pullInCheckout(settings);
  } else {
    await cloneIntoCheckout(settings);
  }
  return requireHeadSha(checkout);
}
