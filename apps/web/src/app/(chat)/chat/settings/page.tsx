import { GlobalSettingsPanel } from "@/chat/components/global-settings-panel";

export default function GlobalSettingsPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-5 pt-16 pb-16">
      <p className="mb-6 font-display text-muted text-sm uppercase tracking-wide">
        CHAT
      </p>
      <GlobalSettingsPanel />
    </main>
  );
}
