import type { ReactNode } from "react";
import { NeuxusShell } from "@/neuxus/components/neuxus-shell";

export default function NeuxusLayout({ children }: { children: ReactNode }) {
  return <NeuxusShell>{children}</NeuxusShell>;
}
