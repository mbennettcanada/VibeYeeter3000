# Cloudflare Access gates ingress to every `*.internal` app subdomain. The
# actual access policy (who's allowed in) is intentionally left as a stub —
# it should be filled in per-org (JumpCloud IdP group, allowed emails, etc.)
# before this is applied for real.
provider "cloudflare" {}

data "cloudflare_zone" "internal" {
  name = var.cloudflare_zone
}

resource "cloudflare_access_application" "apps_wildcard" {
  account_id                = var.cloudflare_account_id
  zone_id                   = data.cloudflare_zone.internal.id
  name                      = "vibeyeeter-apps"
  domain                    = "*.${var.cloudflare_zone}"
  type                      = "self_hosted"
  session_duration          = "24h"
  auto_redirect_to_identity = true
}

# Stub policy — replace with the real JumpCloud-backed rule (e.g. an
# `include` block scoped to an Access group) before applying against a real
# Cloudflare account.
resource "cloudflare_access_policy" "apps_wildcard_stub" {
  application_id = cloudflare_access_application.apps_wildcard.id
  zone_id        = data.cloudflare_zone.internal.id
  name           = "vibeyeeter-apps-stub-policy"
  precedence     = 1
  decision       = "allow"

  include {
    everyone = true
  }
}
