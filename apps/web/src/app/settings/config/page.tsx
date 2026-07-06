import { PageHeader } from "@/components/PageHeader";
import { PlatformConfigManager } from "@/components/PlatformConfigManager";

export default function SettingsConfigPage() {
  return (
    <>
      <PageHeader title="Platform Config" />
      <PlatformConfigManager />
    </>
  );
}
