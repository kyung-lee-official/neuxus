import { ProviderModelsPanel } from "@/components/provider-models-panel";

export default function ProviderDetailPage({
  params,
}: {
  params: { providerId: string };
}) {
  return (
    <ProviderModelsPanel providerId={decodeURIComponent(params.providerId)} />
  );
}
