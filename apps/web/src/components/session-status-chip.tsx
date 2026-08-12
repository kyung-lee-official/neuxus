"use client";

import { useState } from "react";
import { Modal } from "./modal";

type SessionStatusChipProps = {
  apiUrl: string;
  sessionId: string | null;
  healthLoading: boolean;
  healthOk: boolean;
  healthError: string | null;
};

export function SessionStatusChip({
  apiUrl,
  sessionId,
  healthLoading,
  healthOk,
  healthError,
}: SessionStatusChipProps) {
  const [open, setOpen] = useState(false);

  const statusLabel = healthLoading
    ? "API health checking"
    : healthOk
      ? "API healthy"
      : "API down";

  const dotClass = healthLoading
    ? "bg-muted"
    : healthOk
      ? "bg-ok"
      : "bg-danger";

  return (
    <>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded border border-line bg-surface shadow-sm hover:border-ink"
        aria-label={`${statusLabel}. Open session details.`}
        title={statusLabel}
        onClick={() => setOpen(true)}
      >
        <span className={`block h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </button>

      <Modal
        open={open}
        title="Session & API"
        titleId="session-status-dialog-title"
        onClose={() => setOpen(false)}
      >
        <dl className="m-0 flex flex-col gap-3 text-sm">
          <div>
            <dt className="m-0 text-muted text-xs">API health</dt>
            <dd
              className={
                healthLoading
                  ? "m-0 mt-0.5 text-muted"
                  : healthOk
                    ? "m-0 mt-0.5 text-ok"
                    : "m-0 mt-0.5 text-danger"
              }
            >
              {healthLoading
                ? "Checking…"
                : healthOk
                  ? "ok"
                  : `down${healthError ? ` (${healthError})` : ""}`}
            </dd>
          </div>
          <div>
            <dt className="m-0 text-muted text-xs">API base URL</dt>
            <dd className="m-0 mt-0.5 break-all font-mono text-ink text-xs">
              {apiUrl}
            </dd>
          </div>
          <div>
            <dt className="m-0 text-muted text-xs">Current session</dt>
            <dd className="m-0 mt-0.5 break-all font-mono text-ink text-xs">
              {sessionId ?? "none — New chat or Ask"}
            </dd>
          </div>
        </dl>
      </Modal>
    </>
  );
}
