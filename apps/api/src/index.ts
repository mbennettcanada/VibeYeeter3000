import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

const app = await buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`api listening on port ${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
