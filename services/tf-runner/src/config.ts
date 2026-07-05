import "./env.js";

export const config = {
  port: Number(process.env.PORT ?? 4001),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl:
    process.env.TF_RUNNER_DATABASE_URL ?? "postgres://postgres:dev@localhost:5432/vibeyeeter",
  tofuBin: process.env.TOFU_BIN ?? "tofu",
};
