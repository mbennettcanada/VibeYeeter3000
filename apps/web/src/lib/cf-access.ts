const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD;

// Builds the Cloudflare Access login URL for this app, with a redirect back
// to whatever page the user was trying to reach. Returns undefined if CF
// Access isn't configured (e.g. local dev with DEV_AUTH_BYPASS=true).
export function getCfAccessLoginUrl(redirectUrl: string): string | undefined {
  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    return undefined;
  }
  return `https://${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/login/${CF_ACCESS_AUD}?redirect_url=${encodeURIComponent(redirectUrl)}`;
}
