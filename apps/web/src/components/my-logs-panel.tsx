"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  getMyLogs,
  listUsers,
  type MyLogItem,
  UserQueryKey,
} from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { displayName } from "@/lib/display-name";
import { ActiveUserPanel } from "./active-user-panel";
import { Modal } from "./modal";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function levelClass(level: string): string {
  if (level === "error" || level === "fatal") {
    return "rounded border border-danger px-1.5 py-0.5 font-mono text-danger text-xs";
  }
  if (level === "warn" || level === "warning") {
    return "rounded border border-line px-1.5 py-0.5 font-mono text-ink text-xs";
  }
  return "rounded border border-line px-1.5 py-0.5 font-mono text-muted text-xs";
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function formatMeta(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function MyLogsPanel() {
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const [selected, setSelected] = useState<MyLogItem | null>(null);

  const [storeReady, setStoreReady] = useState(false);
  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

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

  if (!storeReady) {
    return <p className="m-0 px-5 py-8 text-muted text-sm">Loading…</p>;
  }
  if (!activeUserId || !active) {
    return (
      <main className="flex min-h-dvh flex-col items-center px-5 py-10">
        <p className="m-0 text-muted text-sm">
          Sign in to review your own retrieve and synthesis logs.
        </p>
        <Link href="/auth" className="mt-3 text-accent text-sm underline">
          Go to sign in
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <ActiveUserPanel active={active} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-8 pb-16">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <header className="flex flex-col gap-1 rounded-md border border-line bg-surface p-6 shadow-sm">
            <h1 className="m-0 font-display text-2xl text-ink">My logs</h1>
            <p className="m-0 text-muted text-sm">
              Retrieve and synthesis activity for {displayName(active.id)}.
              Newest first.
            </p>
          </header>

          {usersQuery.isError ? (
            <section className="rounded-md border border-danger bg-surface p-5">
              <p className="m-0 text-danger text-sm">
                {errorMessage(usersQuery.error)}
              </p>
            </section>
          ) : null}

          <List apiKey={active.apiKey} onSelect={setSelected} />
        </div>
      </div>

      <Modal
        open={selected !== null}
        title={selected ? `${selected.name ?? "log"} — ${selected.msg}` : ""}
        titleId="log-detail-title"
        onClose={() => setSelected(null)}
      >
        {selected ? <LogDetail item={selected} /> : null}
      </Modal>
    </div>
  );
}

function List({
  apiKey,
  onSelect,
}: {
  apiKey: string;
  onSelect: (item: MyLogItem) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: UserQueryKey.MyLogs(null),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getMyLogs({ apiKey, cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (query.isLoading) {
    return (
      <section className="rounded-md border border-line bg-surface p-5">
        <p className="m-0 text-muted text-sm">Loading…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="rounded-md border border-danger bg-surface p-5">
        <p className="m-0 text-danger text-sm">{errorMessage(query.error)}</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-md border border-line bg-surface p-5">
        <p className="m-0 text-muted text-sm">
          No logs yet. Send an ask on the chat page to generate one.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-md border border-line bg-surface">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it)}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-canvas"
              >
                <span className="w-44 shrink-0 font-mono text-muted text-xs">
                  {formatDateTime(it.createdAt)}
                </span>
                <span className={levelClass(it.level)}>{it.level}</span>
                <span className="w-20 shrink-0 font-mono text-ink text-xs">
                  {it.name ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink text-sm">
                  {it.msg}
                </span>
                <span className="shrink-0 font-mono text-muted text-xs">
                  #{shortId(it.id)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded border border-line bg-surface px-3 py-1.5 text-ink text-sm hover:border-accent disabled:opacity-60"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </>
  );
}

function LogDetail({ item }: { item: MyLogItem }) {
  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <dl className="m-0 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">id</dt>
        <dd className="m-0 break-all font-mono text-ink text-xs">{item.id}</dd>
        <dt className="text-muted">time</dt>
        <dd className="m-0 font-mono text-ink text-xs">
          {formatDateTime(item.createdAt)}
        </dd>
        <dt className="text-muted">level</dt>
        <dd className="m-0 text-ink text-xs">{item.level}</dd>
        <dt className="text-muted">name</dt>
        <dd className="m-0 font-mono text-ink text-xs">{item.name ?? "—"}</dd>
        <dt className="text-muted">msg</dt>
        <dd className="m-0 break-words text-ink text-xs">{item.msg}</dd>
      </dl>
      <div>
        <h3 className="m-0 mb-1 font-display text-ink text-sm">meta</h3>
        <pre className="m-0 max-h-96 overflow-auto rounded border border-line bg-canvas p-2 font-mono text-ink text-xs">
          {formatMeta(item.meta)}
        </pre>
      </div>
    </div>
  );
}
