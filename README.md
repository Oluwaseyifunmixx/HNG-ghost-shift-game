# Ghost Shift

A small three.js puzzle game for the start.ng platform. Record a run, then race your own ghost through a door before it vanishes.

## Run it

    npm install
    npm run dev

## How to play

- Run 1: walk to the orange plate and stand on it. You have 9 seconds, and everything you do is recorded as your ghost.
- Run 2: your ghost repeats Run 1 and holds the plate, so the door opens. Get through the door to the pink pad before the ghost vanishes and the door shuts.
- Missing the door costs a heart. Three hearts, then a one-hour wait.
- Keys: arrows or W A S D to move, Shift to sprint, V to switch the camera, R to restart a run, C to start over, O to change outfit.

## Notes

- A static front end only: no backend of its own, nothing stored but the hearts (in the browser).
- The character is a stand-in data object (`outfits` in `src/main.ts`). It will be replaced by the start.ng character when the platform provides one.
