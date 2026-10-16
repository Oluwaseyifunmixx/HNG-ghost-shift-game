import { defineConfig } from 'vite';

// start.ng serves the built game from its own address, and asks for relative
// paths so the game works anywhere. "./" makes every built file link relative.
export default defineConfig({
  base: './',
});
