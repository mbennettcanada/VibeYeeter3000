import "./env.js";
import { buildApp } from "./app.js";
import { config } from "./config.js";

const port = config.port;

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
