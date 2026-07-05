import { PageHeader } from "@/components/PageHeader";
import { DomainsManager } from "@/components/DomainsManager";

export default function SettingsDomainsPage() {
  return (
    <>
      <PageHeader title="Domains" />
      <DomainsManager />
    </>
  );
}
