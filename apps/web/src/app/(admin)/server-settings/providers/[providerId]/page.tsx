import { ProviderModelsPanel } from "@/components/provider-models-panel";

type Props = {
  params: Promise<{ providerId: string }>;
};

export default async function ProviderDetailPage({ params }: Props) {
  const { providerId } = await params;

  return <ProviderModelsPanel providerId={decodeURIComponent(providerId)} />;
}
