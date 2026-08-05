import ControlTower from "@/components/control-tower";
import { bootstrapPmoData } from "@/lib/pmo-fixtures";

export default function HomePage() {
  return <ControlTower initialData={bootstrapPmoData} />;
}
