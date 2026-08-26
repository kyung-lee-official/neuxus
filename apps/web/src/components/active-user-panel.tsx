"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  type ApiUser,
  createSession,
  deleteSession,
  listSessions,
  listUsers,
  patchSessionTitle,
  UserQueryKey,
  type UserSessionRow,
} from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { displayName } from "@/lib/display-name";
import { AdminBadge } from "./admin-badge";
import { Modal } from "./modal";

function shortSessionId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function sessionLabel(session: UserSessionRow): string {
  const title = session.title?.trim();
  return title && title.length > 0 ? title : shortSessionId(session.id);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function ActiveUserPanel({ active }: { active: ApiUser | null }) {
  const queryClient = useQueryClient();
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveSessionId = useActiveUserStore((s) => s.setActiveSessionId);
  const [editingSession, setEditingSession] = useState<UserSessionRow | null>(
    null,
  );
  const [deletingSession, setDeletingSession] = useState<UserSessionRow | null>(
    null,
  );
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSession) titleInputRef.current?.focus();
  }, [editingSession]);

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: Boolean(active),
  });

  const sessionsQuery = useQuery({
    queryKey: active
      ? UserQueryKey.Sessions(active.id)
      : (["sessions", "none"] as const),
    queryFn: () => {
      if (!active) throw new Error("Not signed in.");
      return listSessions(active.apiKey);
    },
    enabled: Boolean(active),
  });

  const sessions = sessionsQuery.data ?? [];

  useEffect(() => {
    if (!active || sessionsQuery.isLoading) return;
    if (sessions.length === 0) {
      if (activeSessionId) setActiveSessionId(null);
      return;
    }
    if (activeSessionId && sessions.some((s) => s.id === activeSessionId)) {
      return;
    }
    const latest = sessions[0];
    if (latest) setActiveSessionId(latest.id);
  }, [
    active,
    sessions,
    sessionsQuery.isLoading,
    activeSessionId,
    setActiveSessionId,
  ]);

  const createSessionMutation = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("Not signed in.");
      return createSession(active.apiKey);
    },
    onSuccess: async (session) => {
      if (!active) return;
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.Sessions(active.id),
      });
      setActiveSessionId(session.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: (input: { sessionId: string; title: string | null }) => {
      if (!active) throw new Error("Not signed in.");
      return patchSessionTitle({
        apiKey: active.apiKey,
        sessionId: input.sessionId,
        title: input.title,
      });
    },
    onSuccess: async () => {
      if (!active) return;
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.Sessions(active.id),
      });
      setEditingSession(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { sessionId: string }) => {
      if (!active) throw new Error("Not signed in.");
      return deleteSession({
        apiKey: active.apiKey,
        sessionId: input.sessionId,
      });
    },
    onSuccess: async (_result, input) => {
      if (!active) return;
      if (activeSessionId === input.sessionId) setActiveSessionId(null);
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.Sessions(active.id),
      });
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.Data(active.id, 1),
      });
      setDeletingSession(null);
    },
  });

  const live =
    active && usersQuery.data
      ? (usersQuery.data.find((u) => u.id === active.id) ?? active)
      : active;

  const err =
    (createSessionMutation.isError
      ? errorMessage(createSessionMutation.error)
      : null) ||
    (sessionsQuery.isError ? errorMessage(sessionsQuery.error) : null) ||
    (renameMutation.isError ? errorMessage(renameMutation.error) : null) ||
    (deleteMutation.isError ? errorMessage(deleteMutation.error) : null);

  function openEditTitle(session: UserSessionRow) {
    setEditingSession(session);
    setTitleDraft(session.title ?? "");
  }

  function saveTitle() {
    if (!editingSession) return;
    const trimmed = titleDraft.trim();
    renameMutation.mutate({
      sessionId: editingSession.id,
      title: trimmed.length > 0 ? trimmed : null,
    });
  }

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-3 border-line border-r bg-surface p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Link
          href="/ask"
          className="m-0 font-display text-ink text-xl uppercase no-underline hover:text-accent"
        >
          neuxus
        </Link>
        {live?.role === "admin" ? (
          <Link
            href="/server-settings"
            className="flex h-8 w-8 items-center justify-center rounded text-muted no-underline hover:bg-canvas hover:text-ink"
            aria-label="Admin"
            title="Admin"
          >
            <GearIcon />
          </Link>
        ) : null}
      </div>
      <div className="shrink-0 border-line border-t" />
      {!live ? (
        <div className="mt-auto flex shrink-0 flex-col gap-1.5 border-line border-t pt-3">
          <p className="m-0 text-muted text-sm">
            Nobody signed in.{" "}
            <Link href="/auth" className="text-accent">
              Go to Sign in
            </Link>
          </p>
        </div>
      ) : (
        <>
          {err ? (
            <p className="m-0 shrink-0 text-danger text-sm">{err}</p>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-1">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h3 className="m-0 font-display text-base text-ink">Chats</h3>
              <button
                type="button"
                className="rounded border border-accent bg-accent px-2 py-0.5 text-white text-xs disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createSessionMutation.isPending}
                onClick={() => createSessionMutation.mutate()}
              >
                New chat
              </button>
            </div>
            <p className="m-0 shrink-0 text-muted text-xs">
              Sorted by latest message. Ask mode uses the selected chat.
            </p>
            {sessionsQuery.isLoading ? (
              <p className="m-0 text-muted text-xs">Loading chats…</p>
            ) : sessions.length === 0 ? (
              <p className="m-0 text-muted text-xs">
                No chats yet. Start one with New chat or Ask.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {sessions.map((session) => {
                  const selected = session.id === activeSessionId;
                  return (
                    <li key={session.id}>
                      <div
                        className={
                          selected
                            ? "flex w-full items-start gap-1 rounded border border-accent border-l-4 bg-accent/15 px-2 py-1.5"
                            : "flex w-full items-start gap-1 rounded border border-line bg-canvas px-2 py-1.5"
                        }
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 border-0 bg-transparent p-0 text-left text-ink"
                          onClick={() => setActiveSessionId(session.id)}
                        >
                          <span className="truncate font-display text-ink text-sm">
                            {sessionLabel(session)}
                          </span>
                          <span className="font-mono text-muted text-xs">
                            {formatDateTime(session.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-muted hover:border-line hover:text-ink"
                          aria-label={`Edit title for ${sessionLabel(session)}`}
                          title="Edit title"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditTitle(session);
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-muted hover:border-danger hover:text-danger"
                          aria-label={`Delete chat ${sessionLabel(session)}`}
                          title="Delete chat"
                          disabled={deleteMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingSession(session);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-1.5 border-line border-t pt-3">
            <h2 className="m-0 flex items-center gap-2 font-display text-ink text-lg">
              {displayName(live.id)}
              {live.role === "admin" ? <AdminBadge /> : null}
            </h2>
            <Link
              href={`/settings/${encodeURIComponent(live.id)}`}
              className="rounded border border-line bg-transparent px-2 py-1.5 text-center text-muted text-xs no-underline hover:border-ink hover:text-ink"
            >
              Settings
            </Link>
            <Link
              href="/auth"
              className="rounded border border-line bg-transparent px-2 py-1.5 text-center text-muted text-xs no-underline hover:border-ink hover:text-ink"
            >
              Switch Account
            </Link>
          </div>
        </>
      )}

      <Modal
        open={editingSession !== null}
        title="Edit chat title"
        titleId="edit-session-title-dialog"
        onClose={() => {
          if (!renameMutation.isPending) setEditingSession(null);
        }}
        closeDisabled={renameMutation.isPending}
      >
        <p className="m-0 mb-3 font-mono text-muted text-xs">
          {editingSession ? shortSessionId(editingSession.id) : ""}
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span>Title</span>
          <input
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
            value={titleDraft}
            disabled={renameMutation.isPending}
            placeholder="Optional display name"
            ref={titleInputRef}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              }
            }}
          />
        </label>
        <p className="mt-2 mb-0 text-muted text-xs">
          Leave empty to clear and show the short session id.
        </p>
        {renameMutation.isError ? (
          <p className="mt-3 mb-0 text-danger text-sm">
            {errorMessage(renameMutation.error)}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3.5 py-2 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={renameMutation.isPending}
            onClick={() => setEditingSession(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border border-accent bg-accent px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={renameMutation.isPending}
            onClick={saveTitle}
          >
            {renameMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      <Modal
        open={deletingSession !== null}
        title="Delete chat?"
        titleId="delete-session-dialog"
        onClose={() => {
          if (!deleteMutation.isPending) setDeletingSession(null);
        }}
        closeDisabled={deleteMutation.isPending}
      >
        <p className="m-0 mb-2 text-ink text-sm">
          Delete{" "}
          <span className="font-display">
            {deletingSession ? sessionLabel(deletingSession) : ""}
          </span>
          ?
        </p>
        <p className="m-0 mb-1 font-mono text-muted text-xs">
          {deletingSession ? shortSessionId(deletingSession.id) : ""}
        </p>
        <p className="m-0 mt-3 text-muted text-sm">
          All messages in this chat are removed along with it. This cannot be
          undone.
        </p>
        {deleteMutation.isError ? (
          <p className="mt-3 mb-0 text-danger text-sm">
            {errorMessage(deleteMutation.error)}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-line bg-transparent px-3.5 py-2 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={deleteMutation.isPending}
            onClick={() => setDeletingSession(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border border-danger bg-danger px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!deletingSession) return;
              deleteMutation.mutate({ sessionId: deletingSession.id });
            }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete chat"}
          </button>
        </div>
      </Modal>
    </aside>
  );
}
