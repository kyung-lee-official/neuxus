import { SettingsPanel } from "@/components/settings-panel";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { userId } = await params;

  return (
    <main className="flex min-h-dvh flex-col items-center px-5 py-10 pb-16">
      <p className="mb-6 font-display text-muted text-sm uppercase tracking-wide">
        neuxus
      </p>
      <SettingsPanel userId={decodeURIComponent(userId)} />
    </main>
  );
}
