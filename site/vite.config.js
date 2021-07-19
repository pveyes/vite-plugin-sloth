const { resolve } = require("path");
import { defineConfig } from "vite";
import sloth from "vite-plugin-sloth";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        docs: resolve(__dirname, "docs/index.html"),
        docsBasic: resolve(__dirname, "docs/basic/index.html"),
        docsAdvanced: resolve(__dirname, "docs/advanced/index.html"),
        docsPlugin: resolve(__dirname, "docs/plugin/index.html"),
      },
    },
  },
  plugins: [
    sloth({
      flattenSlot: (element) => {
        return element.tagName === "span";
      },
    }),
  ],
});
