import { embedStaleChildren } from "../embed/index.ts";
import { emitStage, finishCorpusOp } from "./corpus-status.ts";
import { resolveCorpusSettings } from "./defaults.ts";
import { corpusCheckoutDir, refreshCorpusCheckout } from "./git.ts";
import { ingestCorpusCheckout } from "./ingest-checkout.ts";
import { loadCorpusSettings, saveCorpusLastSyncedSha } from "./settings.ts";

/**
 * Run the full corpus pipeline against the unified lock. Caller must hold
 * the lock (acquired via {@link tryStartCorpusOp} with operation `"sync"`).
 */
export async function runCorpusSync(): Promise<void> {
  try {
    emitStage("fetch");
    const sha = await refreshCorpusCheckout();
    const settings = resolveCorpusSettings(await loadCorpusSettings());
    emitStage("ingest");
    await ingestCorpusCheckout(corpusCheckoutDir(), settings.docsRoot);
    emitStage("embed");
    await embedStaleChildren({ failFast: true });
    await saveCorpusLastSyncedSha(sha);
    finishCorpusOp();
  } catch (err) {
    finishCorpusOp(err);
    throw err;
  }
}
