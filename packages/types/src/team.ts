export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

// GET/POST /settings/teams return this richer shape (member count + SAML
// group mappings) rather than the bare Team used elsewhere (e.g. the app
// registration team dropdown).
export interface TeamWithDetail extends Team {
  memberCount: number;
  groups: string[];
}
