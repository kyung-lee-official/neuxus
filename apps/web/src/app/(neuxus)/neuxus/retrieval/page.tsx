import { RetrievalPanel } from "@/neuxus/components/retrieval-panel";

type Props = {
  searchParams: Promise<{ kb?: string | string[] }>;
};

export default async function RetrievalPage({ searchParams }: Props) {
  const { kb } = await searchParams;
  const raw = Array.isArray(kb) ? kb : kb ? [kb] : [];
  const initialKnowledgeBaseIds = raw.filter((id) => id !== "");

  return <RetrievalPanel initialKnowledgeBaseIds={initialKnowledgeBaseIds} />;
}
