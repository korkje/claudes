import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.tsx"],
    format: "esm",
    target: "node18",
    platform: "node",
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
});
