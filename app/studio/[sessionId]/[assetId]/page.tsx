import type { Metadata } from "next";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export const metadata: Metadata = {
  title: "Studio · GladMat",
  description: "Adjust and export generated GladMat artwork.",
};

export default async function StudioPage({
  params,
}: {
  params: Promise<{ sessionId: string; assetId: string }>;
}) {
  const { sessionId, assetId } = await params;
  return <StudioWorkspace key={`${sessionId}:${assetId}`} sessionId={sessionId} assetId={assetId} />;
}
