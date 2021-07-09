import { defineConfig } from "vite";
import sloth from '../src/index';

export default defineConfig({
  plugins: [
    sloth({ flattenSlot: true })
  ],
});
