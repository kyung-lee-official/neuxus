"use client";

import { useState } from "react";
import { useNeuxusAuthStore } from "@/neuxus/lib/auth-store";

export function NeuxusAuthPanel({ error }: { error?: string }) {
  const setToken = useNeuxusAuthStore((s) => s.setToken);
  const [value, setValue] = useState("");

  return (
    <section className="w-full max-w-md rounded-md border border-line bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="m-0 font-display text-2xl text-ink">NEUXUS sign in</h1>
        <span className="rounded border border-line px-2 py-0.5 font-mono text-muted text-xs">
          NEUXUS
        </span>
      </div>
      <p className="mt-0 mb-4 text-muted text-sm">
        Enter the neuxus service token from{" "}
        <code className="font-mono text-xs">NEUXUS_SERVICE_TOKEN</code> in{" "}
        <code className="font-mono text-xs">apps/api/.env</code>.
      </p>
      {error ? <p className="mt-0 mb-3 text-danger text-sm">{error}</p> : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!next) return;
          setToken(next);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span>Service token</span>
          <input
            type="password"
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
            value={value}
            placeholder="service token"
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!value.trim()}
        >
          Enter neuxus
        </button>
      </form>
    </section>
  );
}
