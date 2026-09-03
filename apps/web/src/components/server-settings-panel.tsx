"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import { ApiError, nukeDatabase } from "@/lib/api";
import { useAdminUser } from "./admin-shell";
import { EmbedSettingsBlock } from "./embed-settings-block";
import { ImageDescTestBlock } from "./image-desc-test-block";
import { LogSettingsBlock } from "./log-settings-block";
import { Modal } from "./modal";
import { RetrieveSettingsBlock } from "./retrieve-settings-block";
import { SynthesisSettingsBlock } from "./synthesis-settings-block";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ServerSettingsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAdminUser();
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [nukeConfirmOpen, setNukeConfirmOpen] = useState(false);

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-md border border-line bg-surface p-6 shadow-sm">
        <h1 className="m-0 font-display text-2xl text-ink">Server settings</h1>
        <p className="m-0 text-muted text-sm">
          Admin-only provider config for embeddings and Ask synthesis.
        </p>
      </section>
      <EmbedSettingsBlock actorApiKey={user.apiKey} />
      <RetrieveSettingsBlock actorApiKey={user.apiKey} />
      <SynthesisSettingsBlock actorApiKey={user.apiKey} />
      <ImageDescTestBlock actorApiKey={user.apiKey} />
      <LogSettingsBlock actorApiKey={user.apiKey} />
      <NukeDbBlock
        actorApiKey={user.apiKey}
        confirmOpen={nukeConfirmOpen}
        onConfirmOpen={setNukeConfirmOpen}
        onNuked={() => {
          setActiveUserId(null);
          queryClient.clear();
          router.replace("/auth");
        }}
      />
    </div>
  );
}

function NukeDbBlock({
  actorApiKey,
  confirmOpen,
  onConfirmOpen,
  onNuked,
}: {
  actorApiKey: string;
  confirmOpen: boolean;
  onConfirmOpen: (open: boolean) => void;
  onNuked: () => void;
}) {
  const nukeMutation = useMutation({
    mutationFn: () => nukeDatabase({ apiKey: actorApiKey, target: "app" }),
    onSuccess: () => {
      onConfirmOpen(false);
      onNuked();
    },
  });

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
      <h2 className="m-0 font-display text-ink text-lg">Danger zone</h2>
      <p className="m-0 text-muted text-sm">
        Hard-wipe the neuxus database. Re-run Prisma migrate and seed afterward.
      </p>
      {nukeMutation.isError ? (
        <p className="m-0 text-danger text-sm">
          {errorMessage(nukeMutation.error)}
        </p>
      ) : null}
      <button
        type="button"
        className="self-start rounded border border-danger bg-transparent px-3.5 py-2 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={nukeMutation.isPending}
        onClick={() => onConfirmOpen(true)}
      >
        Nuke DB
      </button>
      <Modal
        open={confirmOpen}
        title="Nuke DB?"
        titleId="nuke-dialog-title"
        onClose={() => onConfirmOpen(false)}
        closeDisabled={nukeMutation.isPending}
      >
        <p className="m-0 text-muted text-sm">
          Drops the entire <code className="font-mono text-xs">public</code>{" "}
          schema on <code className="font-mono text-xs">DATABASE_URL</code>{" "}
          (tables and extensions). Cannot be undone. Afterward run Prisma
          migrate and <code className="font-mono text-xs">bun run seed</code>.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded border border-danger bg-danger px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={nukeMutation.isPending}
            onClick={() => nukeMutation.mutate()}
          >
            {nukeMutation.isPending ? "Nuking…" : "Nuke DB"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
