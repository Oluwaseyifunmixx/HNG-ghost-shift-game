# Ghost Shift

A small three.js puzzle game for [start.ng](https://start.ng). Record a run, then race your own ghost through a door before it vanishes.

## Run it

    npm install
    npm run dev

## How to play

- Run 1: walk to the orange plate and stand on it. You have 10 seconds, and everything you do is recorded as your ghost.
- Run 2: your ghost repeats Run 1 and holds the plate, so the door opens. Get through the door before the ghost vanishes and the door shuts.
- Missing the door costs a heart. Three hearts, then a 5-minute wait.
- Keys: arrows or W A S D to move, Shift to sprint, V to switch the camera, R to restart a run, C to start over. On the start screen, C opens the character screen.
- On a phone, use the on-screen joystick and buttons, with the phone on its side.

## The player and their character

On start.ng the game asks start.ng who is playing (through start.ng's connect page) and dresses the player as their start.ng character. A guest gets start.ng's guest look, with a button to sign in. The only thing a player picks inside the game is the glow of their ghost.

When start.ng does not answer (for example when you run the game on your own computer), the game uses a character made in the game itself, saved in the browser, so it always works. The code for this is in `src/platform.ts`.

## Publish on start.ng

start.ng never builds a game. It serves the built files, so the built `dist/` folder is committed on purpose.

1. `npm run build` makes `dist/` (with relative paths, see `vite.config.ts`). `public/cover.png` (16:10) is copied into it.
2. Commit `dist/` and push to this public repo.
3. `POST https://api.start.ng/games/check` with `{"repo_url": "...", "name": "ghost-shift"}` must report no errors.
4. `POST https://api.start.ng/games/publish` with the same body. The first time, open the `approve_url` it returns.
5. After that, every push to the branch updates the game by itself.

See https://start.ng/docs.md for the full rules.

## Notes

- A static front end only: no backend of its own. Hearts and the ghost glow are saved in the browser.
