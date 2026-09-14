/**
 * Shared checkout error. Thrown by the git plumbing (`corpus/git.ts`) and the
 * docs-root walk (`ingest/walk.ts`); carries the HTTP status the corpus route
 * maps it to. Neutral home so neither `corpus` nor `ingest` imports the other.
 */
export class CorpusGitError extends Error {
  readonly httpStatus: 400 | 409 | 500;

  constructor(httpStatus: 400 | 409 | 500, message: string) {
    super(message);
    this.name = "CorpusGitError";
    this.httpStatus = httpStatus;
  }
}
