import { PageHeader } from "@/components/PageHeader";
import { TokensManager } from "@/components/TokensManager";

export default function SettingsTokensPage() {
  return (
    <>
      <PageHeader title="API Tokens" />
      <TokensManager />
    </>
  );
}
