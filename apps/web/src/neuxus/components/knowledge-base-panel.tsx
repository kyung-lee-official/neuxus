"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  createKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBase,
  listKnowledgeBases,
  UserQueryKey,
  updateKnowledgeBase,
} from "@/neuxus/lib/api";
import { CorpusSettingsBlock } from "./corpus-settings-block";
import { KnowledgeBaseSelector } from "./knowledge-base-selector";
import { KnowledgePagesBlock } from "./knowledge-pages-block";
import { useNeuxusToken } from "./neuxus-shell";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

const primaryButton =
  "rounded border border-accent bg-accent px-3.5 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded border border-line bg-transparent px-3.5 py-1.5 text-ink text-sm disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
  "rounded border border-danger bg-transparent px-3.5 py-1.5 text-danger text-sm disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60";

const createSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "lowercase letters, digits, and dashes only",
    ),
  name: z.string().trim().min(1, "name is required"),
});
type CreateValues = z.infer<typeof createSchema>;

const renameSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
});
type RenameValues = z.infer<typeof renameSchema>;

/** Create form — corpus-backed only for now (`writable: false`). */
function CreateBaseForm({
  apiKey,
  onCreated,
  onCancel,
}: {
  apiKey: string;
  onCreated: (base: KnowledgeBase) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { id: "", name: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateValues) =>
      createKnowledgeBase({
        apiKey,
        id: values.id.trim(),
        name: values.name.trim(),
      }),
    onSuccess: async (base) => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.KnowledgeBases,
      });
      onCreated(base);
    },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded border border-line bg-canvas p-4"
      onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
    >
      <h3 className="m-0 font-display text-base text-ink">
        New knowledge base
      </h3>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>Id</span>
        <input
          className={inputClass}
          placeholder="docs"
          disabled={createMutation.isPending}
          {...form.register("id")}
        />
        {form.formState.errors.id ? (
          <span className="text-danger text-xs">
            {form.formState.errors.id.message}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>Name</span>
        <input
          className={inputClass}
          placeholder="Product docs"
          disabled={createMutation.isPending}
          {...form.register("name")}
        />
        {form.formState.errors.name ? (
          <span className="text-danger text-xs">
            {form.formState.errors.name.message}
          </span>
        ) : null}
      </label>
      {createMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(createMutation.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButton}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={createMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Rename form for the selected base. */
function RenameBaseForm({
  apiKey,
  base,
  onDone,
  onCancel,
}: {
  apiKey: string;
  base: KnowledgeBase;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: base.name },
  });

  const renameMutation = useMutation({
    mutationFn: (values: RenameValues) =>
      updateKnowledgeBase({
        apiKey,
        id: base.id,
        name: values.name.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.KnowledgeBases,
      });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded border border-line bg-canvas p-4"
      onSubmit={form.handleSubmit((values) => renameMutation.mutate(values))}
    >
      <h3 className="m-0 font-display text-base text-ink">Rename {base.id}</h3>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>Name</span>
        <input
          className={inputClass}
          disabled={renameMutation.isPending}
          {...form.register("name")}
        />
        {form.formState.errors.name ? (
          <span className="text-danger text-xs">
            {form.formState.errors.name.message}
          </span>
        ) : null}
      </label>
      {renameMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(renameMutation.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButton}
          disabled={renameMutation.isPending}
        >
          {renameMutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={renameMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Delete confirm for the selected base (cascades to its pages/chunks). */
function DeleteBaseConfirm({
  apiKey,
  base,
  onDeleted,
  onCancel,
}: {
  apiKey: string;
  base: KnowledgeBase;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteKnowledgeBase({ apiKey, id: base.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.KnowledgeBases,
      });
      onDeleted();
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded border border-danger bg-canvas p-4">
      <p className="m-0 text-ink text-sm">
        Delete <span className="font-mono">{base.id}</span>? This removes its
        pages, chunks, and vectors.
      </p>
      {deleteMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(deleteMutation.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {deleteMutation.isPending ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={deleteMutation.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function KnowledgeBasePanel() {
  const token = useNeuxusToken();
  const [kbId, setKbId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "create" | "rename" | "delete">(
    "none",
  );

  const basesQuery = useQuery({
    queryKey: UserQueryKey.KnowledgeBases,
    queryFn: () => listKnowledgeBases(token),
  });
  const bases = basesQuery.data ?? [];
  const selected = bases.find((base) => base.id === kbId) ?? null;

  useEffect(() => {
    const data = basesQuery.data;
    if (!data) return;
    if (kbId && data.some((base) => base.id === kbId)) return;
    setKbId(data[0]?.id ?? null);
  }, [kbId, basesQuery.data]);

  const switchPanel = (next: "create" | "rename" | "delete") => {
    setPanel((current) => (current === next ? "none" : next));
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Knowledge base</h1>
        <p className="m-0 text-muted text-sm">
          Pick a knowledge base, then inspect ingested pages and manage its
          corpus.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <KnowledgeBaseSelector
            actorApiKey={token}
            selectedId={kbId}
            onSelect={(id) => {
              setKbId(id);
              setPanel("none");
            }}
          />
          <button
            type="button"
            className={secondaryButton}
            onClick={() => switchPanel("create")}
          >
            New
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={!selected}
            onClick={() => switchPanel("rename")}
          >
            Rename
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={!selected}
            onClick={() => switchPanel("delete")}
          >
            Delete
          </button>
        </div>
        {panel === "create" ? (
          <CreateBaseForm
            apiKey={token}
            onCreated={(base) => {
              setKbId(base.id);
              setPanel("none");
            }}
            onCancel={() => setPanel("none")}
          />
        ) : null}
        {panel === "rename" && selected ? (
          <RenameBaseForm
            key={selected.id}
            apiKey={token}
            base={selected}
            onDone={() => setPanel("none")}
            onCancel={() => setPanel("none")}
          />
        ) : null}
        {panel === "delete" && selected ? (
          <DeleteBaseConfirm
            key={selected.id}
            apiKey={token}
            base={selected}
            onDeleted={() => {
              setKbId(null);
              setPanel("none");
            }}
            onCancel={() => setPanel("none")}
          />
        ) : null}
      </section>

      {basesQuery.isLoading ? (
        <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
          <p className="m-0 text-muted text-sm">Loading knowledge bases…</p>
        </section>
      ) : basesQuery.isError ? (
        <section className="flex flex-col items-start gap-2 rounded-md border border-line bg-surface p-6">
          <p className="m-0 text-danger text-sm">
            {errorMessage(basesQuery.error)}
          </p>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void basesQuery.refetch()}
          >
            Retry
          </button>
        </section>
      ) : !selected ? (
        <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
          <p className="m-0 text-muted text-sm">
            No knowledge bases yet. Use <strong>New</strong> to create one.
          </p>
        </section>
      ) : (
        <>
          {selected.writable ? (
            <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
              <p className="m-0 text-muted text-sm">
                Direct-write knowledge base — no corpus. Page editing is coming
                later.
              </p>
            </section>
          ) : (
            <CorpusSettingsBlock
              actorApiKey={token}
              knowledgeBaseId={selected.id}
            />
          )}
          <Suspense
            fallback={
              <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6">
                <p className="m-0 text-muted text-sm">Loading pages…</p>
              </section>
            }
          >
            <KnowledgePagesBlock
              actorApiKey={token}
              knowledgeBaseId={selected.id}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
