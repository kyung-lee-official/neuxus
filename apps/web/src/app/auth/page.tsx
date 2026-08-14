import { AuthPanel } from "@/components/auth-panel";

export default function AuthPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <p className="mb-6 font-display text-muted text-sm uppercase tracking-wide">
        neuxus
      </p>
      <AuthPanel />
    </main>
  );
}
