import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Route tests build the app via app.js and inject requests directly,
    // with no CF Access session cookie. Default them to the dev auth bypass
    // so requireSession/requireSessionOrToken attach a fake admin user.
    // auth.test.ts overrides this back to "false" at the top of its own
    // file (before it imports app.js) to exercise the real CF Access flow.
    env: {
      DEV_AUTH_BYPASS: "true",
    },
  },
});
