import type { FastifyInstance } from "fastify";

export async function samlRoutes(app: FastifyInstance): Promise<void> {
  app.get("/saml/login", async (_request, reply) => {
    // TODO: redirect to JumpCloud IdP SSO URL
    reply.send({ todo: true });
  });

  app.post("/saml/callback", async (_request, reply) => {
    // TODO: validate SAML assertion, create/update user, establish session
    reply.send({ todo: true });
  });

  app.get("/saml/metadata", async (_request, reply) => {
    // TODO: return SP metadata XML
    reply.send({ todo: true });
  });
}
