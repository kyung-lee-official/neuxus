"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, type ApiUser, getUserData, UserQueryKey } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { Modal } from "./modal";
import type { ApiPayload } from "./response-view";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function UserDataPanel({
  active,
  sessionId,
  lastResponse,
}: {
  active: ApiUser | null;
  sessionId: string | null;
  lastResponse: ApiPayload | null;
}) {
  const [messagePage, setMessagePage] = useState(1);
  const [rawOpen, setRawOpen] = useState(false);

  const dataQuery = useQuery({
    queryKey: active
      ? UserQueryKey.Data(active.id, messagePage)
      : (["users", "none", "data", messagePage] as const),
    queryFn: () => {
      if (!active) throw new Error("No user selected");
      return getUserData({
        id: active.id,
        apiKey: active.apiKey,
        messagePage,
      });
    },
    enabled: Boolean(active),
  });

  const dump = dataQuery.data;
  const err = dataQuery.isError ? errorMessage(dataQuery.error) : null;

  const messages = dump?.messages;
  const sessionMessages = (messages?.items ?? []).filter((m) =>
    sessionId ? m.sessionId === sessionId : true,
  );
  // API returns newest first; chat reads oldest → newest top to bottom.
  const chatMessages = [...sessionMessages].reverse();
  const totalPages = messages
    ? Math.max(1, Math.ceil(messages.total / messages.pageSize))
    : 1;

  const lastAssistantIndex = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i]?.role === "assistant") return i;
    }
    return -1;
  })();

  const rawForLatestAssistant =
    lastResponse &&
    !lastResponse.error &&
    lastResponse.sessionId &&
    sessionId &&
    lastResponse.sessionId === sessionId &&
    lastAssistantIndex >= 0
      ? lastResponse
      : null;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 min-w-0 font-display text-ink text-lg">
          Chat
          {sessionId ? (
            <span className="ml-2 font-mono font-normal text-muted text-xs">
              Session{" "}
              <code className="break-all font-mono text-xs">{sessionId}</code>
            </span>
          ) : (
            <span className="ml-2 font-normal text-muted text-sm">
              No chat selected — New chat or Ask to start one.
            </span>
          )}
        </h2>
        <button
          type="button"
          className="shrink-0 rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void dataQuery.refetch()}
          disabled={!active || dataQuery.isFetching}
        >
          Refresh
        </button>
      </div>

      {!active ? (
        <p className="m-0 text-muted text-sm">Sign in to view messages.</p>
      ) : dataQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading…</p>
      ) : err && !dump ? (
        <p className="m-0 text-danger text-sm">{err}</p>
      ) : dump ? (
        <div className="flex flex-col gap-3">
          {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}

          {messages && messages.total > messages.pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-muted text-xs">
                page {messages.page}/{totalPages} · {messages.pageSize}/page
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={messagePage <= 1 || dataQuery.isFetching}
                  onClick={() => setMessagePage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={messagePage >= totalPages || dataQuery.isFetching}
                  onClick={() =>
                    setMessagePage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {!sessionId ? (
            <p className="m-0 text-muted text-sm">
              Select a chat in the sidebar.
            </p>
          ) : chatMessages.length === 0 ? (
            <p className="m-0 text-muted text-sm">
              No messages in this chat yet.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {chatMessages.map((m, index) => {
                const isUser = m.role === "user";
                const showRawInfo =
                  !isUser &&
                  index === lastAssistantIndex &&
                  rawForLatestAssistant !== null;
                return (
                  <li
                    key={m.id}
                    className={
                      isUser ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        isUser
                          ? "max-w-[85%] rounded-2xl rounded-br-md border border-accent bg-accent/15 px-3 py-2"
                          : "relative max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-canvas px-3 py-2"
                      }
                    >
                      <div
                        className={
                          isUser
                            ? "mb-1 flex flex-wrap justify-end gap-x-2 font-mono text-muted text-xs"
                            : "mb-1 flex flex-wrap items-center gap-x-2 font-mono text-muted text-xs"
                        }
                      >
                        <span className="text-ink">
                          {isUser ? "you" : "assistant"}
                        </span>
                        <span>{formatDateTime(m.createdAt)}</span>
                        {showRawInfo ? (
                          <button
                            type="button"
                            className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-[10px] text-muted leading-none hover:border-ink hover:text-ink"
                            aria-label="Show raw API response"
                            title="Raw API response"
                            onClick={() => setRawOpen(true)}
                          >
                            i
                          </button>
                        ) : null}
                      </div>
                      <pre className="m-0 whitespace-pre-wrap break-words font-display text-ink text-sm leading-snug">
                        {m.content}
                      </pre>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <Modal
        open={rawOpen && rawForLatestAssistant !== null}
        title="Raw response"
        titleId="chat-raw-response-title"
        onClose={() => setRawOpen(false)}
      >
        <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas p-2.5 font-mono text-ink text-xs leading-snug">
          {rawForLatestAssistant
            ? JSON.stringify(rawForLatestAssistant, null, 2)
            : ""}
        </pre>
      </Modal>
    </section>
  );
}
