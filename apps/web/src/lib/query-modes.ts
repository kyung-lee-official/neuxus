import type { AskMode } from "@/lib/api";

/** UI path segment → API `POST /query` mode */
export const QUERY_TAB_ROUTES = [
  {
    href: "/ask",
    label: "ask",
    mode: "ask" as const satisfies AskMode,
    help: "answer from personal memory + chat history via LLM",
  },
] as const;

export type QueryTabRoute = (typeof QUERY_TAB_ROUTES)[number];

export function tabByMode(mode: AskMode): QueryTabRoute {
  const tab = QUERY_TAB_ROUTES.find((t) => t.mode === mode);
  if (!tab) throw new Error(`Unknown query mode: ${mode}`);
  return tab;
}

export function modeLabel(mode: AskMode): string {
  return tabByMode(mode).label;
}
