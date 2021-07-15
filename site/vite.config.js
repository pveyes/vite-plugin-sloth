import { defineConfig } from "vite";
import sloth from "vite-plugin-sloth";

export default defineConfig({
  plugins: [sloth({ flattenSlot: true })],
});
