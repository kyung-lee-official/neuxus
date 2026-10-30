"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveUserStore } from "@/chat/lib/active-user-store";
import {
  ApiError,
  chatApiBaseUrl,
  getHealth,
  listChatKnowledgeBases,
  listSessionMessages,
  listUsers,
  postQuery,
  UserQueryKey,
} from "@/chat/lib/api";
import { ActiveUserPanel } from "./active-user-panel";
import { MarkdownBubble } from "./markdown-bubble";
import { SessionStatusChip } from "./session-status-chip";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ChatPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const setActiveSessionId = useActiveUserStore((s) => s.setActiveSessionId);
  const [storeReady, setStoreReady] = useState(false);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  const healthQuery = useQuery({
    queryKey: UserQueryKey.Health,
    queryFn: getHealth,
  });

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: storeReady,
  });

  const active = useMemo(() => {
    const users = usersQuery.data;
    if (!users || !activeUserId) return null;
    return users.find((u) => u.id === activeUserId) ?? null;
  }, [usersQuery.data, activeUserId]);

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/chat/auth");
      return;
    }
    const users = usersQuery.data;
    if (!users) return;
    if (!users.some((u) => u.id === activeUserId)) {
      setActiveUserId(null);
      router.replace("/chat/auth");
    }
  }, [storeReady, activeUserId, usersQuery.data, router, setActiveUserId]);

  const knowledgeBasesQuery = useQuery({
    queryKey: UserQueryKey.KnowledgeBases,
    queryFn: () => {
      if (!active) throw new Error("Not signed in.");
      return listChatKnowledgeBases(active.apiKey);
    },
    enabled: Boolean(active),
  });

  const knowledgeBases = knowledgeBasesQuery.data ?? [];

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setKnowledgeBaseId(null);
      return;
    }
    if (
      knowledgeBaseId &&
      knowledgeBases.some((base) => base.id === knowledgeBaseId)
    ) {
      return;
    }
    setKnowledgeBaseId(knowledgeBases[0]?.id ?? null);
  }, [knowledgeBases, knowledgeBaseId]);

  const messagesQuery = useQuery({
    queryKey: activeSessionId
      ? UserQueryKey.SessionMessages(activeSessionId)
      : (["sessions", "none", "messages"] as const),
    queryFn: () => {
      if (!active || !activeSessionId) throw new Error("No session selected.");
      return listSessionMessages({
        apiKey: active.apiKey,
        sessionId: activeSessionId,
      });
    },
    enabled: Boolean(active && activeSessionId),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => {
      if (!active) throw new Error("Not signed in.");
      if (!knowledgeBaseId) throw new Error("Choose a knowledge base.");
      return postQuery({
        apiKey: active.apiKey,
        message,
        mode: "ask",
        knowledgeBaseId,
        sessionId: activeSessionId,
      });
    },
    onSuccess: async (result) => {
      setDraft("");
      const sessionId = result.sessionId ?? activeSessionId;
      if (result.sessionId && result.sessionId !== activeSessionId) {
        setActiveSessionId(result.sessionId);
      }
      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.SessionMessages(sessionId),
        });
      }
      if (active) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.Sessions(active.id),
        });
      }
    },
  });

  const messages = messagesQuery.data ?? [];
  const sending = sendMutation.isPending;

  useEffect(() => {
    if (messages.length === 0 && !sending) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  if (!storeReady || !activeUserId || !active) {
    return (
      <p className="m-0 px-5 py-8 text-muted text-sm">
        {!storeReady ? "Loading session…" : "Redirecting to sign in…"}
      </p>
    );
  }

  const healthOk = healthQuery.data?.ok === true;
  const healthError = healthQuery.isError
    ? errorMessage(healthQuery.error)
    : null;
  const canSend = Boolean(knowledgeBaseId) && draft.trim() !== "" && !sending;

  return (
    <div className="flex h-dvh overflow-hidden">
      <ActiveUserPanel active={active} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute top-3 left-3 z-20">
          <div className="pointer-events-auto">
            <SessionStatusChip
              apiUrl={chatApiBaseUrl()}
              sessionId={activeSessionId}
              healthLoading={healthQuery.isLoading}
              healthOk={healthOk}
              healthError={healthError}
            />
          </div>
        </div>

        <header className="shrink-0 border-line border-b bg-surface px-5 py-3 pl-14">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 font-display text-muted text-xs uppercase tracking-wide">
                CHAT
              </p>
              <h1 className="mt-1 mb-0 font-display text-ink text-xl">
                Ask the knowledge base
              </h1>
            </div>
            <label className="flex min-w-56 flex-col gap-1 text-sm">
              <span className="text-muted text-xs">Knowledge base</span>
              <select
                className="rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
                value={knowledgeBaseId ?? ""}
                disabled={knowledgeBasesQuery.isLoading || sending}
                onChange={(event) => setKnowledgeBaseId(event.target.value)}
              >
                {knowledgeBases.length === 0 ? (
                  <option value="">No knowledge bases</option>
                ) : (
                  knowledgeBases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          {knowledgeBasesQuery.isError ? (
            <p className="mx-auto mt-2 mb-0 w-full max-w-3xl text-danger text-sm">
              {errorMessage(knowledgeBasesQuery.error)}
            </p>
          ) : null}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {messagesQuery.isLoading ? (
              <p className="m-0 text-muted text-sm">Loading messages…</p>
            ) : messagesQuery.isError ? (
              <p className="m-0 text-danger text-sm">
                {errorMessage(messagesQuery.error)}
              </p>
            ) : messages.length === 0 && !sending ? (
              <div className="rounded-md border border-line bg-surface p-5">
                <p className="m-0 text-muted text-sm">
                  No messages yet. Ask a question and the answer will use the
                  selected knowledge base.
                </p>
              </div>
            ) : (
              messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-md border border-accent bg-accent px-3.5 py-2.5 text-sm text-white">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className="rounded-md border border-line bg-surface px-3.5 py-2.5"
                  >
                    <MarkdownBubble source={message.content} />
                  </div>
                ),
              )
            )}

            {sending ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5 text-muted text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Retrieving evidence and asking the model…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="shrink-0 border-line border-t bg-surface px-5 py-4">
          <form
            className="mx-auto flex w-full max-w-3xl flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const message = draft.trim();
              if (!message) return;
              sendMutation.mutate(message);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                className="min-h-20 flex-1 resize-y rounded border border-line bg-canvas px-3 py-2 text-ink text-sm disabled:opacity-60"
                placeholder="Ask a question…"
                value={draft}
                disabled={sending || !knowledgeBaseId}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="submit"
                className="rounded border border-accent bg-accent px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSend}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            {sendMutation.isError ? (
              <p className="m-0 text-danger text-sm">
                {errorMessage(sendMutation.error)}
              </p>
            ) : null}
            <p className="m-0 text-muted text-xs">
              Enter sends · Shift+Enter adds a newline
            </p>
          </form>
        </footer>
      </div>
    </div>
  );
}
