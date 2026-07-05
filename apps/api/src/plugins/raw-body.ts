import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

// GitHub webhook signatures (X-Hub-Signature-256) are computed over the exact
// request bytes. Fastify's default JSON parser only hands the route handler
// the parsed object, so we override it to stash the raw string on the
// request first — every JSON route still gets a normally parsed body.
export function registerRawBodyCapture(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      request.rawBody = body as string;
      if (!body) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
}
