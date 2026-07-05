export type DomainType = "platform" | "custom";
export type DnsStatus = "pending" | "active" | "error";
export type CertStatus = "pending" | "active" | "error";

export interface AppDomain {
  id: string;
  appId: string;
  hostname: string;
  domainType: DomainType;
  dnsStatus: DnsStatus;
  certStatus: CertStatus;
  createdAt: string;
  verifiedAt: string | null;
}

export interface AppDomainWithApp extends AppDomain {
  appName: string;
}
