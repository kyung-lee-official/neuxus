import { ServerSettingsPanel } from "@/components/server-settings-panel";

export default function ServerSettingsPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-5 py-10 pb-16">
      <p className="mb-6 font-display text-muted text-sm tracking-wide">
        neuxus
      </p>
      <ServerSettingsPanel />
    </main>
  );
}
