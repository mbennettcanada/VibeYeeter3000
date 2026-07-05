import { SAML } from "@node-saml/node-saml";
import { config } from "../config.js";

let cached: SAML | undefined;

// Only called from routes guarded by hasSamlConfig, so the required fields
// are always present at this point.
export function getSamlClient(): SAML {
  if (!cached) {
    cached = new SAML({
      issuer: config.saml.entityId as string,
      callbackUrl: config.saml.callbackUrl as string,
      entryPoint: config.saml.idpSsoUrl,
      idpCert: config.saml.idpCert as string,
      wantAssertionsSigned: false,
    });
  }
  return cached;
}
