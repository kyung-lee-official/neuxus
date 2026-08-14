import { ServerSettingsPanel } from "@/components/server-settings-panel";

export default function ServerSettingsPage() {
  return (
    <main className="min-h-dvh px-5 pt-8 pb-16">
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-6 font-display text-muted text-sm tracking-wide">
          neuxus
        </p>
        <ServerSettingsPanel />
      </div>
    </main>
  );
}
