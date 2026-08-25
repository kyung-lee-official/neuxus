import type { AskMode } from "@/lib/api";
import { modeLabel } from "@/lib/query-modes";
import { MarkdownBubble } from "./markdown-bubble";

export type ApiPayload = {
  userId?: string;
  sessionId?: string;
  mode?: AskMode;
  answer?: string;
  slug?: string;
  saved?: boolean;
  error?: string;
};

export function ResponseView({
  pending,
  payload,
}: {
  pending: boolean;
  payload: ApiPayload | null;
}) {
  if (pending) {
    return (
      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 font-display text-ink text-lg">Response</h2>
        <p className="m-0 text-muted text-sm">Calling API…</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 font-display text-ink text-lg">Response</h2>
        <p className="m-0 text-muted text-sm">—</p>
      </section>
    );
  }

  const raw = JSON.stringify(payload, null, 2);

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="m-0 font-display text-ink text-lg">Response</h2>

      <div className="flex flex-col gap-3">
        {payload.error ? (
          <p className="m-0 text-danger">{payload.error}</p>
        ) : payload.saved ? (
          <div className="font-display text-base text-ink leading-snug">
            <p className="m-0">
              Saved note{payload.slug ? ` as ` : "."}
              {payload.slug ? (
                <code className="font-mono text-sm">{payload.slug}</code>
              ) : null}
              {payload.userId ? ` for ${payload.userId}` : null}.
            </p>
          </div>
        ) : typeof payload.answer === "string" ? (
          <MarkdownBubble source={payload.answer} />
        ) : (
          <p className="m-0 text-muted text-sm">No answer field.</p>
        )}
      </div>

      {(payload.userId || payload.mode || payload.sessionId) &&
      !payload.error ? (
        <p className="m-0 font-mono text-muted text-xs">
          {[
            payload.userId ? `user ${payload.userId}` : null,
            payload.mode ? `mode ${modeLabel(payload.mode)}` : null,
            payload.sessionId ? `session ${payload.sessionId}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5 border-line border-t pt-2.5">
        <h3 className="m-0 font-mono font-normal text-muted text-sm">
          Raw JSON
        </h3>
        <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas p-2.5 font-mono text-xs leading-snug">
          {raw}
        </pre>
      </div>
    </section>
  );
}
