import ControlTower from "@/components/control-tower";
import { bootstrapPmoData } from "@/lib/pmo-fixtures";
import { readPmoDocument } from "@/lib/github-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialData = bootstrapPmoData;
  let initialSource: "github" | "bootstrap" = "bootstrap";
  let initialStorageConfigured = false;
  try {
    const result = await readPmoDocument();
    initialData = result.document ?? bootstrapPmoData;
    initialSource = result.document ? "github" : "bootstrap";
    initialStorageConfigured = result.configured;
  } catch {
    initialStorageConfigured = false;
  }
  return <ControlTower initialData={initialData} initialSource={initialSource} initialStorageConfigured={initialStorageConfigured} />;
}
