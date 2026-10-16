import * as THREE from 'three';
import './style.css';
import {
  buildPerson,
  escapeHtml,
  getPlatformCharacter,
  isCustomizerOpen,
  loadCharacter,
  openCustomizer,
  saveCharacter,
  setGhostAppearance,
} from './character';
import type { Character, Person } from './character';
import { IS_TOUCH, createTouchControls } from './touch';
import { cleanAddress, fetchPlayer, signInUrl } from './platform';

// ---------- Level data: everything about a level lives here ----------
// A Rect is a box on the floor. x and z are its centre.
type Rect = { x: number; z: number; width: number; depth: number };

// The house is z from -2.5 to 9. The balcony is z from -9 to -2.5.
// Everything is centred on x = 0.
const FLOOR_WIDTH = 36;
const FLOOR_DEPTH = 18;
const WALL_HEIGHT = 3.6; // this is also the ceiling height
const WALL_THICKNESS = 0.5;
const BACK_FACE_Z = -2.25; // the inside face of the back wall

type FurnitureKind =
  | 'sofa'
  | 'coffee'
  | 'bookshelf'
  | 'island'
  | 'dining'
  | 'plant';
type Furniture = { kind: FurnitureKind; rect: Rect };

const level = {
  start: { x: -15, z: 7 },
  plate: { x: -7, z: 6, width: 2, depth: 2 } as Rect,
  // The door fills the gap in the back wall (x from 10.5 to 13.5).
  door: { x: 12, z: -2.5, width: 3, depth: 0.5 } as Rect,
  walls: [
    { x: -3.75, z: -2.5, width: 28.5, depth: 0.5 }, // x from -18 to 10.5
    { x: 15.75, z: -2.5, width: 4.5, depth: 0.5 }, // x from 13.5 to 18
  ] as Rect[],
  // The exit pad on the balcony. Reach it to complete the stage.
  exit: { x: 12, z: -7, width: 4.4, depth: 2.2 } as Rect,
  // Furniture you have to run around. All of it is solid.
  furniture: [
    { kind: 'sofa', rect: { x: -10, z: -1.15, width: 5, depth: 2.2 } },
    { kind: 'coffee', rect: { x: -10, z: 1.7, width: 3, depth: 1.4 } },
    // A tall bookcase wall: you must go round its back end.
    { kind: 'bookshelf', rect: { x: -3, z: 5.75, width: 1.2, depth: 6.5 } },
    // A kitchen island: you must go round its front end.
    { kind: 'island', rect: { x: 6, z: 0.625, width: 2, depth: 5.75 } },
    // A dining table close to the island, so the gap between them is shut.
    { kind: 'dining', rect: { x: 8.9, z: 2.8, width: 2.6, depth: 2.4 } },
    { kind: 'plant', rect: { x: -16.8, z: -1.3, width: 1.2, depth: 1.2 } },
    { kind: 'plant', rect: { x: 16.8, z: -1.3, width: 1.2, depth: 1.2 } },
  ] as Furniture[],
};

// ---------- Your character: the platform's, or the one you made ----------
// The character made inside this game. It is used when start.ng does not answer
// (for example when testing on your own computer), so the game always works.
let localLook: Character = loadCharacter();
let currentLook: Character = getPlatformCharacter() ?? localLook;
setGhostAppearance(currentLook);

// Set once start.ng answers: is the look start.ng's, and is the player signed in?
let fromPlatform = false;
let signedIn = false;

// ---------- Game settings you can tune ----------
const SAMPLE_INTERVAL = 1 / 30; // seconds between two recording "photos"
const MIN_RUN_SECONDS = 1; // a run shorter than this can't be saved
const RUN_LIMIT_SECONDS = 10; // Run 1 lasts at most this long, then saves itself
const FAIL_GRACE_SECONDS = 0.4; // pause after the ghost vanishes, before "Too late"
const GHOSTS_VANISH_WHEN_DONE = true; // the ghost disappears when its tape ends
const MAX_GHOSTS = 1; // Run 2 cannot be saved as a second ghost (for now)

const SPEED = 5; // how far the person moves each second
const SPRINT_MULTIPLIER = 1.6; // holding Shift: 1.6 times faster
const STAMINA_DRAIN = 1 / 3.5; // sprinting empties the bar in 3.5 seconds
const STAMINA_RECHARGE = 1 / 6; // and it refills in 6 seconds
const STAMINA_RESUME = 0.3; // after running dry, you need 30% to sprint again

// Lives: missing the door in Run 2 costs a heart.
const MAX_HEARTS = 3;
const LOCKOUT_MINUTES = 5; // wait after the last heart. Try 0.2 to test (12 s)
const ENABLE_TEST_KEYS = false; // L refills your hearts. Keep off when publishing
const STORAGE_KEY = 'ghostShift.lives.v1';

// ---------- Look and feel: tune these if it is too dark or too bright ----------
const SHOW_ROOF = true; // the roof over the house
const ROOF_PLAY_OPACITY = 0.12; // how see-through the roof is in the whole-house view
const AMBIENT_LIGHT = 0.55; // general brightness
const MOON_LIGHT = 0.9; // the cool light that makes shadows
const LAMP_INTENSITY = 18; // the warm hanging lamps

// ---------- The cameras ----------
// The whole-house view (menus, and the V key): looks in from outside.
const CAMERA_ELEVATION_DEGREES = 45; // lower = more wall, but the balcony hides
const EXTERIOR_FOV = 50;

// The ceiling camera: it rides on a rail along the ceiling and follows you.
const INTERIOR_FOV = 75; // wider = sees more, but bends the edges
const CAM_HEIGHT = 3.3; // the rail's height (the ceiling is at 3.6)
const CAM_BACK = 7; // how far behind you the camera stays
const CAM_MIN_Z = 3; // the rail's closest point to the back wall
const CAM_MAX_Z = 8.6; // and its closest point to the front wall
const CAM_FOLLOW_SPEED = 3.5; // how fast the camera slides after you
const CAM_LOOK_SPEED = 6; // how fast the camera turns to look at you
const CAM_LOOK_AHEAD = 0.4; // look a little way ahead of where you are running

// The balcony camera: outside the railing, looking back at you.
const BALCONY_CUT_Z = -3; // past this line you are out on the balcony
const BALCONY_CAM_Y = 2.6;
const BALCONY_CAM_Z = -11.8;

// ---------- The screens and HUD pieces on the page ----------
const app = document.querySelector<HTMLDivElement>('#app')!;

// Dark edges around the screen, for a cinematic look.
const vignette = document.createElement('div');
vignette.id = 'vignette';
document.body.appendChild(vignette);

// Full screens: start, how to play, too late, stage complete, out of lives.
const screenEl = document.createElement('div');
screenEl.id = 'screen';
document.body.appendChild(screenEl);

// The bar at the top (Run 1 recording, or Run 2 ghost time).
const topbar = document.createElement('div');
topbar.id = 'topbar';
topbar.innerHTML =
  '<div class="phase"></div>' +
  '<div class="row"><div class="track"><div class="fill"></div></div>' +
  '<div class="secs"></div></div>';
document.body.appendChild(topbar);
const phaseEl = topbar.querySelector<HTMLDivElement>('.phase')!;
const fillEl = topbar.querySelector<HTMLDivElement>('.fill')!;
const secsEl = topbar.querySelector<HTMLDivElement>('.secs')!;

// One short line shown while you are waiting to start moving.
const hintEl = document.createElement('div');
hintEl.id = 'hint';
document.body.appendChild(hintEl);

// A small message that fades out by itself.
const toast = document.createElement('div');
toast.id = 'toast';
document.body.appendChild(toast);

// The sprint bar (bottom left).
const staminaBox = document.createElement('div');
staminaBox.id = 'stamina';
staminaBox.innerHTML =
  '<span>SHIFT</span><div class="track"><div class="fill"></div></div>';
document.body.appendChild(staminaBox);
const staminaFill = staminaBox.querySelector<HTMLDivElement>('.fill')!;

// The security-camera label (top left).
const cctv = document.createElement('div');
cctv.id = 'cctv';
cctv.innerHTML = '<span class="dot"></span><span class="label"></span>';
document.body.appendChild(cctv);
const cctvLabel = cctv.querySelector<HTMLSpanElement>('.label')!;

// The mini map of the house (bottom right).
const minimap = document.createElement('canvas');
minimap.id = 'minimap';
minimap.width = 280;
minimap.height = 140;
document.body.appendChild(minimap);
const mapCtx = minimap.getContext('2d')!;

// The hearts (top right).
const HEART_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const heartsBox = document.createElement('div');
heartsBox.id = 'hearts';
document.body.appendChild(heartsBox);
const heartIcons: HTMLElement[] = [];
for (let i = 0; i < MAX_HEARTS; i++) {
  const icon = document.createElement('span');
  icon.className = 'heart';
  icon.innerHTML = HEART_SVG;
  heartsBox.appendChild(icon);
  heartIcons.push(icon);
}

let toastTimer = 0;
function showMessage(text: string) {
  toast.textContent = text;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2500);
}

// 1. The renderer paints the 3D world onto a canvas on the page.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // lights can cast shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping; // a more "film" look
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

// 2. The scene is the world. Everything we add goes into it.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b13);

// 3. The camera. It is moved by the camera system further down.
const camera = new THREE.PerspectiveCamera(
  EXTERIOR_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEGREES);
const CAMERA_TARGET = new THREE.Vector3(0, 0.8, 0.2);

// Points the whole-house view must be able to see. It backs away until all
// of them are on screen.
const fitPoints: THREE.Vector3[] = [];
for (const x of [-FLOOR_WIDTH / 2 - 0.6, FLOOR_WIDTH / 2 + 0.6]) {
  fitPoints.push(
    new THREE.Vector3(x, 0, -9.3), // the far end of the balcony
    new THREE.Vector3(x, 0, 9.7), // the front of the house
    new THREE.Vector3(x, WALL_HEIGHT + 0.5, -2.95), // the back edge of the roof
    new THREE.Vector3(x, WALL_HEIGHT + 0.5, 9.7), // the front edge of the roof
  );
}

function fitCamera() {
  camera.fov = EXTERIOR_FOV;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Start close, and back away a little at a time until everything fits.
  for (let distance = 8; distance <= 120; distance += 0.5) {
    camera.position.set(
      CAMERA_TARGET.x,
      CAMERA_TARGET.y + Math.sin(CAMERA_ELEVATION) * distance,
      CAMERA_TARGET.z + Math.cos(CAMERA_ELEVATION) * distance,
    );
    camera.lookAt(CAMERA_TARGET);
    camera.updateMatrixWorld();

    const allVisible = fitPoints.every((point) => {
      const onScreen = point.clone().project(camera);
      return Math.abs(onScreen.x) <= 0.94 && Math.abs(onScreen.y) <= 0.94;
    });
    if (allVisible) break;
  }
}

fitCamera();

// 4. Lights: soft general light, cool moonlight (it makes the shadows),
// and warm lamps that hang from the ceiling.
scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT));
scene.add(new THREE.HemisphereLight(0xaab8ff, 0x3a2f28, 0.35));

const moon = new THREE.DirectionalLight(0xcdd9ff, MOON_LIGHT);
moon.position.set(-10, 20, 16);
moon.target.position.set(0, 0, 1);
moon.castShadow = true;
moon.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
moon.shadow.camera.left = -24;
moon.shadow.camera.right = 24;
moon.shadow.camera.top = 16;
moon.shadow.camera.bottom = -16;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 70;
moon.shadow.camera.updateProjectionMatrix();
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
scene.add(moon);
scene.add(moon.target);

// 5. Small helpers for building things.
function makeMat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

// Put a box in the world. (x, y, z) is the CENTRE of the box.
function put(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  cast = true,
  parent: THREE.Object3D = scene,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// A box that sits on the floor, described by a Rect.
function addBox(
  rect: Rect,
  height: number,
  material: THREE.Material,
  cast = true,
  parent: THREE.Object3D = scene,
): THREE.Mesh {
  return put(
    rect.width,
    height,
    rect.depth,
    material,
    rect.x,
    height / 2,
    rect.z,
    cast,
    parent,
  );
}

// 6. Floors: a wooden floor inside the house, a stone deck on the balcony.
function addFloor(
  width: number,
  depth: number,
  x: number,
  z: number,
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    makeMat(color, 0.9),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

addFloor(FLOOR_WIDTH, 11.5, 0, 3.25, 0xa9794a); // house: z from -2.5 to 9
addFloor(FLOOR_WIDTH, 6.5, 0, -5.75, 0x7d756d); // balcony: z from -9 to -2.5

// A rug under the sofa and coffee table (decoration only).
const rug = new THREE.Mesh(
  new THREE.PlaneGeometry(8.5, 4.4),
  makeMat(0x9c4a55, 0.95),
);
rug.rotation.x = -Math.PI / 2;
rug.position.set(-10, 0.01, 1.3);
rug.receiveShadow = true;
scene.add(rug);

// 7. The house: walls with a wooden cap along the top, like a roof edge.
const wallMaterial = makeMat(0xe6d9c3);
const capMaterial = makeMat(0x6b4f35);

function addWall(
  rect: Rect,
  height: number,
  parent: THREE.Object3D = scene,
) {
  addBox(rect, height, wallMaterial, true, parent);
  put(
    rect.width + 0.2,
    0.14,
    rect.depth + 0.2,
    capMaterial,
    rect.x,
    height + 0.07,
    rect.z,
    false,
    parent,
  );
}

// The back wall (two pieces, with the door gap between them).
for (const wall of level.walls) {
  addWall(wall, WALL_HEIGHT);
}

// A dark skirting board along the bottom of the back wall.
const skirtingMaterial = makeMat(0x4a3a2a);
for (const wall of level.walls) {
  put(wall.width, 0.18, 0.08, skirtingMaterial, wall.x, 0.09, BACK_FACE_Z + 0.04, false);
}

// The two side walls.
for (const side of [-1, 1]) {
  addWall(
    {
      x: side * (FLOOR_WIDTH / 2 + WALL_THICKNESS / 2),
      z: 3.375,
      width: WALL_THICKNESS,
      depth: 12.25,
    },
    WALL_HEIGHT,
  );
}

// The front wall comes in two versions. The full one makes the house a
// sealed home. The low one is only used in the whole-house view, so you can
// see inside from the front.
const frontWall = new THREE.Group();
scene.add(frontWall);
const frontLow = new THREE.Group();
scene.add(frontLow);

const FRONT_WALL: Rect = {
  x: 0,
  z: 9 + WALL_THICKNESS / 2,
  width: FLOOR_WIDTH + 2 * WALL_THICKNESS,
  depth: WALL_THICKNESS,
};
addWall(FRONT_WALL, WALL_HEIGHT, frontWall);
addWall(FRONT_WALL, 0.9, frontLow);

// Windows on the back wall (facing into the room).
const windowFrameMaterial = makeMat(0xf5f5f0);
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x9bd4ff,
  transparent: true,
  opacity: 0.65,
  emissive: 0x2a5d86,
  emissiveIntensity: 0.4,
});
// Glass that glows warm from inside, as seen from outside at night.
const warmGlassMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd48a,
  emissive: 0xffb347,
  emissiveIntensity: 0.8,
});

function addWindow(x: number) {
  const y = 1.6;
  put(2.7, 1.7, 0.1, windowFrameMaterial, x, y, BACK_FACE_Z + 0.05, false);
  put(2.4, 1.4, 0.12, glassMaterial, x, y, BACK_FACE_Z + 0.06, false);
  put(0.07, 1.4, 0.14, windowFrameMaterial, x, y, BACK_FACE_Z + 0.07, false);
  put(2.4, 0.07, 0.14, windowFrameMaterial, x, y, BACK_FACE_Z + 0.07, false);
}

for (const windowX of [-13.8, -6.2, -1.5, 3.2, 8, 15.75]) {
  addWindow(windowX);
}

// Windows on the front wall: one face looks into the room, the other
// shows a warm glow from outside.
function addFrontWindow(x: number) {
  const y = 1.9;
  const inside = 9; // the inside face of the front wall
  const outside = 9.5; // the outside face

  put(2.7, 1.7, 0.1, windowFrameMaterial, x, y, inside - 0.05, false, frontWall);
  put(2.4, 1.4, 0.12, glassMaterial, x, y, inside - 0.06, false, frontWall);
  put(0.07, 1.4, 0.14, windowFrameMaterial, x, y, inside - 0.07, false, frontWall);
  put(2.4, 0.07, 0.14, windowFrameMaterial, x, y, inside - 0.07, false, frontWall);

  put(2.7, 1.7, 0.1, windowFrameMaterial, x, y, outside + 0.05, false, frontWall);
  put(2.4, 1.4, 0.12, warmGlassMaterial, x, y, outside + 0.06, false, frontWall);
  put(0.07, 1.4, 0.14, windowFrameMaterial, x, y, outside + 0.07, false, frontWall);
  put(2.4, 0.07, 0.14, windowFrameMaterial, x, y, outside + 0.07, false, frontWall);
}

for (const windowX of [-13.8, -7, 7, 13.8]) {
  addFrontWindow(windowX);
}

// A TV on the back wall, above the sofa.
function addTv(x: number) {
  const frame = makeMat(0x0b0c10, 0.4);
  const screen = new THREE.MeshStandardMaterial({
    color: 0x0b1626,
    emissive: 0x1e5a8a,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  put(3.0, 1.7, 0.08, frame, x, 2.0, BACK_FACE_Z + 0.04, false);
  put(2.8, 1.5, 0.02, screen, x, 2.0, BACK_FACE_Z + 0.09, false);
}
addTv(-10);

// Air conditioners high on the back wall, each with a blinking light.
const acLedMaterial = new THREE.MeshStandardMaterial({
  color: 0x2ecc71,
  emissive: 0x2ecc71,
  emissiveIntensity: 1,
});

function addAirCon(x: number) {
  const body = makeMat(0xf2f4f7, 0.5);
  const dark = makeMat(0x2a2f3a);
  put(1.8, 0.5, 0.3, body, x, 3.1, BACK_FACE_Z + 0.15, false);
  put(1.64, 0.07, 0.06, dark, x, 2.93, BACK_FACE_Z + 0.31, false);
  put(0.06, 0.06, 0.04, acLedMaterial, x + 0.7, 3.22, BACK_FACE_Z + 0.32, false);
}
addAirCon(-13.8);
addAirCon(3.2);

// 8. The balcony railing (iron posts and two rails).
const railMaterial = makeMat(0x2b303b, 0.5);
const RAIL_HEIGHT = 1.1;

function addPost(x: number, z: number) {
  put(0.16, RAIL_HEIGHT, 0.16, railMaterial, x, RAIL_HEIGHT / 2, z, false);
}

function addRail(
  width: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  put(width, 0.08, depth, railMaterial, x, y, z, false);
}

const railBackZ = -FLOOR_DEPTH / 2 - 0.1; // the far edge of the balcony
const railSideX = FLOOR_WIDTH / 2 + 0.1; // the two ends of the balcony
const railSideDepth = 6.35;
const railSideZ = -5.925;

for (let x = -FLOOR_WIDTH / 2; x <= FLOOR_WIDTH / 2; x += 2) {
  addPost(x, railBackZ);
}
for (const z of [-7.1, -5.1, -3.1]) {
  addPost(-railSideX, z);
  addPost(railSideX, z);
}
for (const railHeight of [0.55, 1.05]) {
  addRail(FLOOR_WIDTH + 0.4, 0.08, 0, railHeight, railBackZ);
  addRail(0.08, railSideDepth, -railSideX, railHeight, railSideZ);
  addRail(0.08, railSideDepth, railSideX, railHeight, railSideZ);
}

// 9. The pressure plate and the exit pad.
const PLATE_HEIGHT = 0.1;
const EXIT_HEIGHT = 0.06;

const PLATE_IDLE_COLOR = 0xf4a261; // orange
const PLATE_PRESSED_COLOR = 0x2ecc71; // green
const plateMaterial = new THREE.MeshStandardMaterial({
  color: PLATE_IDLE_COLOR,
  emissive: PLATE_IDLE_COLOR,
  emissiveIntensity: 0.35,
});
const plate = addBox(level.plate, PLATE_HEIGHT, plateMaterial, false);

// The exit pad: a glowing pink square on the balcony, with a pink glow.
addBox(
  level.exit,
  EXIT_HEIGHT,
  new THREE.MeshStandardMaterial({
    color: 0xff6bd6,
    emissive: 0xff6bd6,
    emissiveIntensity: 0.5,
  }),
  false,
);
const exitGlow = new THREE.PointLight(0xff6bd6, 8, 0, 2);
exitGlow.position.set(level.exit.x, 1.6, level.exit.z);
scene.add(exitGlow);

// 10. The door: a frame, a leaf that swings on a hinge, and a handle.
const DOOR_HEIGHT = 2.5;
const DOOR_LEAF_WIDTH = 2.6;
const DOOR_OPEN_ANGLE = 1.65; // radians: about 95 degrees

const doorFrameMaterial = makeMat(0x4a2f1b);
const doorLeafMaterial = makeMat(0x8b5a2b);
const doorPanelMaterial = makeMat(0x9a6a38);
const handleMaterial = new THREE.MeshStandardMaterial({
  color: 0xd4af37,
  metalness: 0.6,
  roughness: 0.3,
});

const doorLeftEdge = level.door.x - level.door.width / 2; // 10.5
const doorRightEdge = level.door.x + level.door.width / 2; // 13.5

// The two side posts of the frame.
for (const postX of [doorLeftEdge + 0.1, doorRightEdge - 0.1]) {
  put(
    0.2,
    DOOR_HEIGHT,
    level.door.depth + 0.12,
    doorFrameMaterial,
    postX,
    DOOR_HEIGHT / 2,
    level.door.z,
  );
}

// The wall above the door, with a cap on top.
const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT;
put(
  level.door.width,
  lintelHeight,
  level.door.depth,
  wallMaterial,
  level.door.x,
  DOOR_HEIGHT + lintelHeight / 2,
  level.door.z,
);
put(
  level.door.width + 0.2,
  0.14,
  level.door.depth + 0.2,
  capMaterial,
  level.door.x,
  WALL_HEIGHT + 0.07,
  level.door.z,
  false,
);

// A small lamp above the door: red when it is shut, green when it is open.
const LAMP_CLOSED_COLOR = 0xe63946;
const LAMP_OPEN_COLOR = 0x2ecc71;
const lampMaterial = new THREE.MeshStandardMaterial({
  color: LAMP_CLOSED_COLOR,
  emissive: LAMP_CLOSED_COLOR,
  emissiveIntensity: 0.9,
});
put(
  0.5,
  0.18,
  0.1,
  lampMaterial,
  level.door.x,
  DOOR_HEIGHT + lintelHeight / 2,
  level.door.z + level.door.depth / 2 + 0.05,
  false,
);

// The door leaf hangs from a pivot at its hinge. Turning the pivot opens it.
const doorPivot = new THREE.Group();
doorPivot.position.set(doorLeftEdge + 0.2, 0, level.door.z);
scene.add(doorPivot);

const leafHeight = DOOR_HEIGHT - 0.05;
put(
  DOOR_LEAF_WIDTH,
  leafHeight,
  0.14,
  doorLeafMaterial,
  DOOR_LEAF_WIDTH / 2,
  leafHeight / 2,
  0,
  true,
  doorPivot,
);

// Raised panels and a lever handle, on both faces of the door.
for (const side of [1, -1]) {
  for (const panelY of [0.7, 1.75]) {
    put(
      DOOR_LEAF_WIDTH - 0.7,
      0.9,
      0.03,
      doorPanelMaterial,
      DOOR_LEAF_WIDTH / 2,
      panelY,
      side * 0.075,
      false,
      doorPivot,
    );
  }
  put(0.12, 0.3, 0.03, handleMaterial, DOOR_LEAF_WIDTH - 0.2, 1.1, side * 0.09, false, doorPivot);
  put(0.4, 0.06, 0.07, handleMaterial, DOOR_LEAF_WIDTH - 0.38, 1.1, side * 0.13, false, doorPivot);
}

// 0 = fully closed, 1 = fully open (it swings there smoothly).
let doorOpen = 0;

// The front door of the house (only seen from outside, and just for show).
function addFrontDoor(x: number) {
  const outside = 9.5;
  put(3.0, 2.8, 0.14, doorFrameMaterial, x, 1.4, outside + 0.07, false, frontWall);
  put(2.5, 2.55, 0.12, doorLeafMaterial, x, 1.275, outside + 0.15, false, frontWall);
  for (const panelY of [0.8, 1.85]) {
    put(1.8, 0.9, 0.04, doorPanelMaterial, x, panelY, outside + 0.22, false, frontWall);
  }
  put(0.12, 0.3, 0.04, handleMaterial, x + 0.95, 1.2, outside + 0.25, false, frontWall);
  put(0.4, 0.06, 0.08, handleMaterial, x + 0.78, 1.2, outside + 0.3, false, frontWall);
  put(0.7, 0.22, 0.12, warmGlassMaterial, x, 3.05, outside + 0.12, false, frontWall);
}
addFrontDoor(0);

// 11. Furniture. Each piece is built from simple boxes.
function addSofa(r: Rect) {
  const fabric = makeMat(0x4b6b8a);
  const cushion = makeMat(0x6a8fb5);
  const back = r.z - r.depth / 2; // the side against the wall
  const armWidth = 0.5;

  put(r.width, 0.45, r.depth, fabric, r.x, 0.225, r.z); // base
  put(r.width, 0.6, 0.55, fabric, r.x, 0.75, back + 0.275); // backrest
  put(armWidth, 0.8, r.depth, fabric, r.x - r.width / 2 + armWidth / 2, 0.4, r.z);
  put(armWidth, 0.8, r.depth, fabric, r.x + r.width / 2 - armWidth / 2, 0.4, r.z);

  const seatWidth = (r.width - 2 * armWidth) / 2;
  const seatDepth = r.depth - 0.55;
  for (const side of [-1, 1]) {
    put(
      seatWidth - 0.04,
      0.22,
      seatDepth - 0.04,
      cushion,
      r.x + side * (seatWidth / 2),
      0.56,
      back + 0.55 + seatDepth / 2,
    );
  }
}

function addCoffeeTable(r: Rect) {
  const wood = makeMat(0x6b4a2f, 0.6);
  put(r.width, 0.1, r.depth, wood, r.x, 0.5, r.z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(
        0.1,
        0.45,
        0.1,
        wood,
        r.x + sx * (r.width / 2 - 0.15),
        0.225,
        r.z + sz * (r.depth / 2 - 0.15),
      );
    }
  }
  put(0.7, 0.06, 0.5, makeMat(0xc0392b), r.x - 0.5, 0.58, r.z, false); // a book
  put(0.22, 0.2, 0.22, makeMat(0xecf0f1), r.x + 0.7, 0.65, r.z, false); // a cup
}

function addBookshelf(r: Rect) {
  const wood = makeMat(0x5a3a22);
  const height = 2.7;
  put(r.width, height, r.depth, wood, r.x, height / 2, r.z);

  // A ledge under each row of books, on both long sides.
  for (const ledgeY of [0.2, 0.9, 1.6, 2.3]) {
    put(r.width + 0.16, 0.06, r.depth, wood, r.x, ledgeY, r.z, false);
  }

  const bookMaterials = [
    0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1,
  ].map((color) => makeMat(color, 0.7));
  const bookGeometry = new THREE.BoxGeometry(0.14, 0.5, 0.2);

  let pick = 3; // a simple repeatable "random" number
  for (const side of [-1, 1]) {
    for (const rowY of [0.5, 1.2, 1.9]) {
      for (
        let z = r.z - r.depth / 2 + 0.25;
        z < r.z + r.depth / 2 - 0.2;
        z += 0.26
      ) {
        pick = (pick * 7 + 3) % 97;
        const book = new THREE.Mesh(
          bookGeometry,
          bookMaterials[pick % bookMaterials.length],
        );
        const tall = 0.8 + (pick % 5) * 0.05; // each book a slightly different height
        book.scale.y = tall;
        book.position.set(
          r.x + side * (r.width / 2 + 0.07),
          rowY - 0.25 + 0.25 * tall,
          z,
        );
        scene.add(book);
      }
    }
  }
}

function addIsland(r: Rect) {
  put(r.width, 1.0, r.depth, makeMat(0x3d4a5c), r.x, 0.5, r.z);
  put(r.width + 0.2, 0.1, r.depth + 0.2, makeMat(0xe8e2d6, 0.4), r.x, 1.05, r.z);
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.2, 0.18, 16),
    makeMat(0xd35400),
  );
  bowl.position.set(r.x, 1.19, r.z + 1.2);
  scene.add(bowl);
}

function addDiningTable(r: Rect) {
  const wood = makeMat(0x7a5230, 0.55);
  put(r.width, 0.1, r.depth, wood, r.x, 0.85, r.z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(
        0.14,
        0.8,
        0.14,
        wood,
        r.x + sx * (r.width / 2 - 0.2),
        0.4,
        r.z + sz * (r.depth / 2 - 0.2),
      );
    }
  }
  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.4, 14),
    makeMat(0x2e86c1, 0.4),
  );
  vase.position.set(r.x, 1.1, r.z);
  scene.add(vase);
  const flowers = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 12),
    makeMat(0xff6b9a),
  );
  flowers.position.set(r.x, 1.4, r.z);
  scene.add(flowers);
}

function addPlant(r: Rect) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.32, 0.6, 18),
    makeMat(0x9c5a3c),
  );
  pot.position.set(r.x, 0.3, r.z);
  pot.castShadow = true;
  scene.add(pot);

  const leaf = makeMat(0x2f8f4e, 0.8);
  const bunches = [
    { dx: 0, y: 1.0, dz: 0, radius: 0.55 },
    { dx: 0.25, y: 1.5, dz: 0.1, radius: 0.45 },
    { dx: -0.2, y: 1.9, dz: -0.1, radius: 0.38 },
  ];
  for (const bunch of bunches) {
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(bunch.radius, 14, 14),
      leaf,
    );
    leaves.position.set(r.x + bunch.dx, bunch.y, r.z + bunch.dz);
    leaves.castShadow = true;
    scene.add(leaves);
  }
}

for (const piece of level.furniture) {
  switch (piece.kind) {
    case 'sofa':
      addSofa(piece.rect);
      break;
    case 'coffee':
      addCoffeeTable(piece.rect);
      break;
    case 'bookshelf':
      addBookshelf(piece.rect);
      break;
    case 'island':
      addIsland(piece.rect);
      break;
    case 'dining':
      addDiningTable(piece.rect);
      break;
    case 'plant':
      addPlant(piece.rect);
      break;
  }
}

// 12. The roof: solid when you look at the house from outside (the menus,
// and while the ceiling camera is on). In the whole-house view it fades to
// see-through while you play, so you can see inside.
const roofMaterials: THREE.MeshStandardMaterial[] = [];
let roofOpacity = 1;

function roofMat(color: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    transparent: true,
    opacity: 1,
  });
  roofMaterials.push(material);
  return material;
}

if (SHOW_ROOF) {
  const slabMaterial = roofMat(0x6a4a3a);
  const tileMaterial = roofMat(0x4a3327);
  const ROOF_DEPTH = 12.65; // from the back wall to the front wall
  const ROOF_CENTER_Z = 3.375;
  const ROOF_BOTTOM = WALL_HEIGHT; // the underside of the roof is the ceiling
  const SLAB_THICKNESS = 0.3;
  const roofTop = ROOF_BOTTOM + SLAB_THICKNESS;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_WIDTH + 2, SLAB_THICKNESS, ROOF_DEPTH),
    slabMaterial,
  );
  slab.position.set(0, ROOF_BOTTOM + SLAB_THICKNESS / 2, ROOF_CENTER_Z);
  scene.add(slab);

  // Rows of "tiles" along the roof.
  for (
    let z = ROOF_CENTER_Z - ROOF_DEPTH / 2 + 0.4;
    z < ROOF_CENTER_Z + ROOF_DEPTH / 2;
    z += 0.6
  ) {
    const row = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_WIDTH + 2, 0.05, 0.09),
      tileMaterial,
    );
    row.position.set(0, roofTop + 0.025, z);
    scene.add(row);
  }

  // A chimney.
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.4, 1.3),
    roofMat(0x8a4b38),
  );
  chimney.position.set(-12, roofTop + 0.7, 6);
  scene.add(chimney);
}

// One wooden beam across the room, near the back wall.
const BEAM_Z = -1.0;
put(
  FLOOR_WIDTH,
  0.22,
  0.3,
  makeMat(0x4a3322),
  0,
  WALL_HEIGHT - 0.11,
  BEAM_Z,
);

// Ceiling fans hang from the beam. Their blades turn in the game loop.
const fanBlades: THREE.Group[] = [];

function addCeilingFan(x: number) {
  const metal = makeMat(0x3a3f4b, 0.5);
  const wood = makeMat(0x8b5a2b);
  put(0.08, 0.28, 0.08, metal, x, WALL_HEIGHT - 0.36, BEAM_Z, false); // the rod
  put(0.4, 0.2, 0.4, metal, x, 3.0, BEAM_Z, false); // the motor

  const blades = new THREE.Group();
  blades.position.set(x, 2.88, BEAM_Z);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.y = (k * Math.PI) / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.26), wood);
    blade.position.x = 0.8;
    blade.castShadow = true;
    arm.add(blade);
    blades.add(arm);
  }
  scene.add(blades);
  fanBlades.push(blades);
}
addCeilingFan(-3.9);
addCeilingFan(5.6);

// Hanging lamps: a shade, a glowing bulb, and a warm light.
function addPendantLamp(x: number, z: number) {
  const cord = makeMat(0x14161c);
  const shade = makeMat(0xe9c46a, 0.4);
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff1c9,
    emissive: 0xffd48a,
    emissiveIntensity: 1.6,
  });

  put(0.03, 0.9, 0.03, cord, x, WALL_HEIGHT - 0.45, z, false);

  const shadeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.42, 0.3, 20),
    shade,
  );
  shadeMesh.position.set(x, 2.55, z);
  scene.add(shadeMesh);

  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), bulb);
  bulbMesh.position.set(x, 2.42, z);
  scene.add(bulbMesh);

  const light = new THREE.PointLight(0xffc27a, LAMP_INTENSITY, 0, 2);
  light.position.set(x, 2.3, z);
  scene.add(light);
}
addPendantLamp(-10, 0.8);
addPendantLamp(6, 0.6);
addPendantLamp(8.9, 2.8);

// 13. The person. How it looks comes from the character data (character.ts).
const PLAYER_SIZE = 1; // the collision box (not the visible size)

// Swing the arms and legs. "walk" is 0 (standing) to 1 (walking), and
// "phase" is where we are in the walking cycle.
function poseWalk(person: Person, walk: number, phase: number) {
  const swing = Math.sin(phase) * 0.7 * walk;
  person.leftLeg.rotation.x = swing;
  person.rightLeg.rotation.x = -swing;
  person.leftArm.rotation.x = -swing * 0.8;
  person.rightArm.rotation.x = swing * 0.8;
}

// Turn smoothly towards a direction (an angle), the short way round.
function turnTowards(group: THREE.Group, targetAngle: number, amount: number) {
  let difference = targetAngle - group.rotation.y;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  group.rotation.y += difference * Math.min(1, amount);
}

// Your own person.
const playerPerson = buildPerson(currentLook);
const player = playerPerson.group;
player.position.set(level.start.x, 0, level.start.z);
scene.add(player);

// Put a new look on your person, and remember it for next time.
function applyLook(look: Character) {
  currentLook = look;
  localLook = look;
  playerPerson.rebuild(look);
  setGhostAppearance(look);
  saveCharacter(look);
  // The sprint afterimages are ghost-shaped, so they follow your body type.
  for (const item of afterimages) item.person.rebuild(null);
}

let playerWalkAmount = 0; // how much your person is walking (0 to 1)
let playerWalkPhase = 0;
let playerGait = 1; // how fast the legs swing (more when sprinting)

// 14. Game state: which screen are we on?
type GameState = 'menu' | 'howto' | 'playing' | 'failed' | 'won' | 'locked';
let state: GameState = 'menu';
let howtoPage = 0; // 0 = Run 1 instructions, 1 = Run 2 instructions

// 15. The camera system.
// "exterior" looks in from outside (menus, and the whole-house view),
// "house" is the ceiling camera, "balcony" is the camera outside the railing.
type CamZone = 'exterior' | 'house' | 'balcony';
type ViewMode = 'ceiling' | 'overview';

let viewMode: ViewMode = 'overview';
let activeCam: CamZone = 'exterior';
let cameraSnap = true; // true = jump straight to the right place (no gliding)

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
let lastPlayerX = 0;
let lastPlayerZ = 0;
let leadX = 0;
let leadZ = 0;

function inGame(): boolean {
  return state === 'playing' || state === 'failed' || state === 'won';
}

function wantedCamZone(): CamZone {
  if (!inGame()) return 'exterior';
  // Out on the balcony, both views cut to the balcony camera.
  if (player.position.z < BALCONY_CUT_Z) return 'balcony';
  return viewMode === 'overview' ? 'exterior' : 'house';
}

function updateCamera(deltaSeconds: number) {
  const zone = wantedCamZone();
  if (zone !== activeCam) {
    activeCam = zone;
    cameraSnap = true;
    if (zone === 'exterior') {
      fitCamera();
    } else {
      camera.fov = INTERIOR_FOV;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
  }
  if (activeCam === 'exterior') return;

  const px = player.position.x;
  const pz = player.position.z;

  // How fast are you running? The camera looks a little way ahead of that.
  if (cameraSnap) {
    lastPlayerX = px;
    lastPlayerZ = pz;
    leadX = 0;
    leadZ = 0;
  }
  const dt = Math.max(deltaSeconds, 0.0001);
  const vx = (px - lastPlayerX) / dt;
  const vz = (pz - lastPlayerZ) / dt;
  lastPlayerX = px;
  lastPlayerZ = pz;
  const wantLeadX = THREE.MathUtils.clamp(vx * CAM_LOOK_AHEAD, -2.5, 2.5);
  const wantLeadZ = THREE.MathUtils.clamp(vz * CAM_LOOK_AHEAD, -2.5, 2.5);
  const leadK = 1 - Math.exp(-deltaSeconds * 4);
  leadX += (wantLeadX - leadX) * leadK;
  leadZ += (wantLeadZ - leadZ) * leadK;

  if (activeCam === 'house') {
    // The ceiling camera: it slides along the rail and turns to watch you.
    desiredPos.set(
      THREE.MathUtils.clamp(px, -16, 16),
      CAM_HEIGHT,
      THREE.MathUtils.clamp(pz + CAM_BACK, CAM_MIN_Z, CAM_MAX_Z),
    );
    desiredLook.set(px + leadX, 0.9, pz + leadZ);
  } else {
    // The balcony camera: outside the railing, looking back at you.
    desiredPos.set(
      THREE.MathUtils.clamp(px, -14, 14),
      BALCONY_CAM_Y,
      BALCONY_CAM_Z,
    );
    desiredLook.set(px, 0.9, pz);
  }

  if (cameraSnap) {
    camPos.copy(desiredPos);
    camLook.copy(desiredLook);
    cameraSnap = false;
  } else {
    camPos.lerp(desiredPos, 1 - Math.exp(-deltaSeconds * CAM_FOLLOW_SPEED));
    camLook.lerp(desiredLook, 1 - Math.exp(-deltaSeconds * CAM_LOOK_SPEED));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// 16. Lives: hearts, saved in this browser.
let hearts = MAX_HEARTS;
let lockedUntil = 0; // the time (in ms) when the lockout ends, or 0

function saveLives() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hearts, lockedUntil }));
  } catch {
    // Storage can be blocked. The game still works, it just won't remember.
  }
}

function loadLives() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { hearts?: number; lockedUntil?: number };
    if (typeof saved.hearts === 'number') {
      hearts = Math.min(MAX_HEARTS, Math.max(0, Math.floor(saved.hearts)));
    }
    if (typeof saved.lockedUntil === 'number') lockedUntil = saved.lockedUntil;
  } catch {
    // Unreadable data: start with full hearts.
  }
}

function renderHearts() {
  heartIcons.forEach((icon, index) => {
    icon.classList.toggle('lost', index >= hearts); // the rightmost go grey first
  });
}

// When the wait is over, give all the hearts back.
function refreshLives() {
  if (hearts > 0) return;
  if (Date.now() >= lockedUntil) {
    hearts = MAX_HEARTS;
    lockedUntil = 0;
    saveLives();
    renderHearts();
    if (state === 'locked') setState('menu');
  }
}

function loseHeart() {
  hearts = Math.max(0, hearts - 1);
  if (hearts === 0) lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  saveLives();
  renderHearts();

  // A little pop on the heart that just went grey.
  const lostIcon = heartIcons[hearts];
  if (lostIcon) {
    lostIcon.classList.remove('pop');
    void lostIcon.offsetWidth; // restart the animation
    lostIcon.classList.add('pop');
  }
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function lockoutText(): string {
  if (LOCKOUT_MINUTES >= 60) {
    const hours = LOCKOUT_MINUTES / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${LOCKOUT_MINUTES} minutes`;
}

// 17. The full screens.
function renderScreen() {
  const dark = state === 'menu' || state === 'howto' || state === 'locked';
  const visible = dark || state === 'failed' || state === 'won';
  screenEl.className = visible ? (dark ? 'show dark' : 'show') : '';

  if (state === 'menu') {
    const who = currentLook.name.trim() || 'Explorer';
    const asGuest = fromPlatform && !signedIn;
    screenEl.innerHTML =
      '<div class="card"><div class="logo">GHOST SHIFT</div>' +
      '<div class="tagline">Team up with your own past self.</div>' +
      '<div class="cta">Click or press Enter to start</div>' +
      `<div class="who">Playing as ${escapeHtml(who)}${signedIn ? ' (start.ng)' : ''}</div>` +
      (asGuest ? '<button class="customize" data-signin>Sign in with start.ng</button>' : '') +
      `<button class="customize" data-customize>${fromPlatform ? 'Ghost glow' : 'Customise character (C)'}</button></div>`;
  } else if (state === 'howto' && howtoPage === 0) {
    screenEl.innerHTML =
      '<div class="card"><div class="page">HOW TO PLAY · 1 / 2</div>' +
      '<h2>Run 1 · Record your ghost</h2>' +
      '<ol class="steps">' +
      '<li>Walk to the <b class="orange">orange plate</b> and stand on it.</li>' +
      `<li>Your clock starts the moment you move. You have <b>${RUN_LIMIT_SECONDS} seconds</b>.</li>` +
      '<li>Press <kbd>Enter</kbd> to save sooner, or wait: it saves itself at 0.</li>' +
      '<li>Everything you do is recorded, and becomes your ghost.</li>' +
      '</ol><div class="cta">Click or press Enter to continue</div></div>';
  } else if (state === 'howto') {
    screenEl.innerHTML =
      '<div class="card"><div class="page">HOW TO PLAY · 2 / 2</div>' +
      '<h2>Run 2 · Race your ghost</h2>' +
      '<ol class="steps">' +
      '<li>Your ghost repeats Run 1 and holds the plate, so the <b>door opens</b>.</li>' +
      '<li>When its recording ends, the ghost vanishes and the door shuts.</li>' +
      '<li>Get <b>through the door</b> before that.</li>' +
            '<li>Furniture blocks the straight route. Plan a path, and sprint where it counts.</li>' +
      '<li>Press <kbd>V</kbd> to try the ceiling camera. Press it again to come back.</li>' +
      `<li>Missing the door costs a <b class="red">heart</b>. You have ${MAX_HEARTS}. ` +
      `Out of hearts? Wait ${lockoutText()} for a full refill.</li>` +
      '</ol><div class="keys">' +
      '<span><kbd>←↑↓→</kbd> or <kbd>W A S D</kbd> move</span>' +
      '<span><kbd>Shift</kbd> sprint</span>' +
      '<span><kbd>R</kbd> restart run</span>' +
      '<span><kbd>C</kbd> start over</span>' +
      '<span><kbd>V</kbd> camera view</span></div>' +
      '<div class="cta">Click or press Enter to play</div></div>';
  } else if (state === 'failed') {
    screenEl.innerHTML =
      '<div class="card"><h2>Too late!</h2>' +
      '<p>The door closed before you got through.</p>' +
      `<div class="lostline">You lost a heart. ${hearts} of ${MAX_HEARTS} left.</div>` +
      '<div class="cta">Enter: try again with the same ghost · C: record a new run</div></div>';
  } else if (state === 'won') {
    screenEl.innerHTML =
      '<div class="card"><h2>Stage complete!</h2>' +
      '<p>You cooperated with your past self.</p>' +
      '<div class="cta">Enter: play the stage again (more stages coming)</div></div>';
  } else if (state === 'locked') {
    screenEl.innerHTML =
      '<div class="card"><h2>Out of lives</h2>' +
      '<p>New lives in</p>' +
      `<div class="count" id="lockCount">${formatCountdown(lockedUntil - Date.now())}</div>` +
      '<p>All your hearts come back when the timer ends.</p></div>';
  } else {
    screenEl.innerHTML = '';
  }

  // Phones and tablets: say "tap", and name the touch buttons.
  if (IS_TOUCH) {
    screenEl.innerHTML = screenEl.innerHTML
      .replace(/Click or press Enter/g, 'Tap')
      .replace(' (C)', '')
      .replace('Press <kbd>Enter</kbd> to save sooner', 'Tap <b>SAVE</b> to save sooner')
      .replace(
        'Press <kbd>V</kbd> to try the ceiling camera. Press it again to come back.',
        'Tap <b>CAMERA</b> to try the ceiling camera. Tap it again to come back.',
      );
    const keysRow = screenEl.querySelector('.keys');
    if (keysRow) {
      keysRow.innerHTML =
        '<span>Left thumb: move</span><span>SPRINT: hold to run faster</span>' +
        '<span>SAVE · RESTART · CAMERA: buttons</span>';
    }
    if (state === 'failed' || state === 'won') {
      screenEl.querySelector('.cta')?.remove();
    }
  }
}

function setState(next: GameState) {
  state = next;
  if (next === 'howto') howtoPage = 0;
  renderScreen();
}

// From the start screen, through the two instruction pages, into the game.
function advanceScreens() {
  if (state === 'menu') {
    setState('howto');
  } else if (state === 'howto') {
    if (howtoPage === 0) {
      howtoPage = 1;
      renderScreen();
    } else {
      setState('playing');
      startRun();
            showMessage(
        IS_TOUCH
          ? 'Tip: tap CAMERA to switch the view'
          : 'Tip: press V to switch the camera',
      );
    }
  }
}

// The character screen. When it closes, the menu is drawn again.
function openCharacterScreen() {
  openCustomizer({
    current: currentLook,
    onChange: fromPlatform ? applyGhostGlow : applyLook,
    onClose: renderScreen,
    ghostOnly: fromPlatform,
    note: signedIn
      ? "Your character comes from start.ng, so it looks the same in every game. You can still pick your ghost's glow here."
      : "You are playing as a guest. Sign in with start.ng to play as your own character. You can still pick your ghost's glow here.",
  });
}

// When the character comes from start.ng, only the ghost's glow is yours to change.
function applyGhostGlow(look: Character) {
  localLook = { ...localLook, ghostColor: look.ghostColor };
  saveCharacter(localLook);
  currentLook = { ...currentLook, ghostColor: look.ghostColor };
  setGhostAppearance(currentLook);
}

screenEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('[data-signin]')) {
    location.href = signInUrl();
    return;
  }
  if (target.closest('[data-customize]')) {
    if (state === 'menu') openCharacterScreen();
    return;
  }
  if (state === 'menu' || state === 'howto') advanceScreens();
});

// 18. Recording: a flipbook of where you stood, 30 times a second.
type Sample = { x: number; z: number };

let stamina = 1; // 0 (empty) to 1 (full)
let exhausted = false; // true after you ran the bar dry

let running = false; // the run only starts when you first move
let runNumber = 1;
let runTime = 0; // seconds since this run started
let nextSampleTime = 0; // when the next "photo" is due
let samples: Sample[] = []; // the "photos" of the current run

// 19. Ghosts: see-through people that replay your saved runs.
type Ghost = {
  person: Person;
  samples: Sample[];
  visible: boolean;
  x: number;
  z: number;
  walkPhase: number;
};
const ghosts: Ghost[] = [];

function addGhost(ghostSamples: Sample[]) {
  const person = buildPerson(null); // null = see-through, in your ghost colour
  person.group.position.set(ghostSamples[0].x, 0, ghostSamples[0].z);
  scene.add(person.group);
  ghosts.push({
    person,
    samples: ghostSamples,
    visible: true,
    x: ghostSamples[0].x,
    z: ghostSamples[0].z,
    walkPhase: 0,
  });
}

function clearGhosts() {
  for (const ghost of ghosts) {
    scene.remove(ghost.person.group);
  }
  ghosts.length = 0;
}

// How long the longest ghost recording is, in seconds.
function longestGhostSeconds(): number {
  let longest = 0;
  for (const ghost of ghosts) {
    longest = Math.max(longest, (ghost.samples.length - 1) * SAMPLE_INTERVAL);
  }
  return longest;
}

// Move every ghost to where it stood at this moment of its run,
// and make it walk or stand still.
function updateGhosts(deltaSeconds: number) {
  const t = runTime / SAMPLE_INTERVAL; // how many "photos" into the run we are
  for (const ghost of ghosts) {
    const last = ghost.samples.length - 1;
    const index = Math.floor(t);
    let newX: number;
    let newZ: number;

    if (index >= last) {
      // The tape has ended.
      ghost.visible = !GHOSTS_VANISH_WHEN_DONE;
      newX = ghost.samples[last].x;
      newZ = ghost.samples[last].z;
    } else {
      ghost.visible = true;
      // Blend between two neighbouring "photos" so the movement is smooth.
      const from = ghost.samples[index];
      const to = ghost.samples[index + 1];
      const blend = t - index;
      newX = from.x + (to.x - from.x) * blend;
      newZ = from.z + (to.z - from.z) * blend;
    }

    // How far and which way did the ghost just move?
    const dx = newX - ghost.x;
    const dz = newZ - ghost.z;
    const moved = Math.hypot(dx, dz);
    const speed = deltaSeconds > 0 ? moved / deltaSeconds : 0;
    const gait = speed / SPEED; // 1 = walking pace, more = sprinting

    ghost.x = newX;
    ghost.z = newZ;
    ghost.person.group.position.set(newX, 0, newZ);
    ghost.person.group.visible = ghost.visible;

    if (moved > 0.0005) {
      turnTowards(ghost.person.group, Math.atan2(dx, dz), deltaSeconds * 12);
    }
    ghost.walkPhase += deltaSeconds * 9 * Math.max(gait, 0.001);
    poseWalk(ghost.person, Math.min(1, gait), ghost.walkPhase);
  }
}

// ---------- Afterimages: faint copies that fade behind you as you sprint ----------
const AFTERIMAGE_COUNT = 9;
const AFTERIMAGE_EVERY = 0.055; // seconds between copies
const AFTERIMAGE_LIFE = 0.5; // seconds until a copy has faded
const AFTERIMAGE_OPACITY = 0.4;

type Afterimage = {
  person: Person;
  material: THREE.MeshStandardMaterial;
  life: number;
};
const afterimages: Afterimage[] = [];
for (let i = 0; i < AFTERIMAGE_COUNT; i++) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x9be7ff,
    emissive: 0x3aa0d8,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const person = buildPerson(null, material);
  person.group.visible = false;
  scene.add(person.group);
  afterimages.push({ person, material, life: 0 });
}
let nextAfterimage = 0;
let afterimageTimer = 0;
let sprintingNow = false;

function updateAfterimages(deltaSeconds: number) {
  afterimageTimer -= deltaSeconds;
  if (sprintingNow && state === 'playing' && afterimageTimer <= 0) {
    afterimageTimer = AFTERIMAGE_EVERY;
    const item = afterimages[nextAfterimage];
    nextAfterimage = (nextAfterimage + 1) % afterimages.length;
    item.life = AFTERIMAGE_LIFE;
    item.material.color.setHex(currentLook.ghostColor);
    item.material.emissive.setHex(currentLook.ghostColor);
    item.material.emissive.multiplyScalar(0.55);
    item.person.group.position.copy(player.position);
    item.person.group.rotation.y = player.rotation.y;
    item.person.leftArm.rotation.x = playerPerson.leftArm.rotation.x;
    item.person.rightArm.rotation.x = playerPerson.rightArm.rotation.x;
    item.person.leftLeg.rotation.x = playerPerson.leftLeg.rotation.x;
    item.person.rightLeg.rotation.x = playerPerson.rightLeg.rotation.x;
    item.person.group.visible = true;
  }
  for (const item of afterimages) {
    if (item.life > 0) {
      item.life -= deltaSeconds;
      item.material.opacity =
        Math.max(0, item.life / AFTERIMAGE_LIFE) * AFTERIMAGE_OPACITY;
      if (item.life <= 0) item.person.group.visible = false;
    }
  }
}

// 20. Runs: start, save, discard, retry and restart.

// Put everything back to the start, and wait for the first move.
function startRun() {
  player.position.set(level.start.x, 0, level.start.z);
  doorOpen = 0;
  running = false;
  runTime = 0;
  stamina = 1;
  exhausted = false;
  cameraSnap = true; // the camera jumps back to you
  samples = [{ x: player.position.x, z: player.position.z }];
  nextSampleTime = SAMPLE_INTERVAL;
}

// Save the current run as a ghost, then get ready for Run 2.
// "automatic" is true when the time limit ran out.
function finishRun(automatic = false) {
  if (!running) return; // nothing to save yet
  if (ghosts.length >= MAX_GHOSTS) return; // Run 2 can't be saved
  if (runTime < MIN_RUN_SECONDS) {
    showMessage('Keep going: a run needs at least 1 second');
    return;
  }
  addGhost(samples);
  console.log(
    `Saved run ${runNumber}: ${samples.length} samples, ${runTime.toFixed(1)}s`,
  );
  showMessage(
    automatic
      ? "Time's up: run saved. Now race your ghost!"
      : 'Run saved. Now race your ghost!',
  );
  runNumber += 1;
  startRun();
}

// Throw the current run away and start again (your ghost stays).
function discardRun() {
  showMessage('Run restarted');
  startRun();
}

// After "Too late": try Run 2 again with the same ghost.
function retryRun() {
  setState('playing');
  startRun();
}

// Clear the ghost and start the stage from Run 1.
function restartStage() {
  clearGhosts();
  runNumber = 1;
  setState('playing');
  startRun();
  showMessage('Record Run 1 again');
}

// Take a "photo" whenever one is due. The while loop catches up if a
// frame took a little longer than usual.
function recordRun(deltaSeconds: number) {
  if (state !== 'playing' || !running) return; // the clock waits until you move
  runTime += deltaSeconds;
  while (runTime >= nextSampleTime) {
    samples.push({ x: player.position.x, z: player.position.z });
    nextSampleTime += SAMPLE_INTERVAL;
  }

  // While you are recording your ghost, the clock can run out.
  if (ghosts.length === 0 && runTime >= RUN_LIMIT_SECONDS) {
    finishRun(true);
  }
}

// 21. The result of the stage: did you get through the door in time?

// Are you completely past the door (out on the balcony)?
function isPastDoor(): boolean {
  return (
    player.position.z <
    level.door.z - level.door.depth / 2 - PLAYER_SIZE / 2
  );
}

function isOnExit(): boolean {
  return (
    Math.abs(player.position.x - level.exit.x) < level.exit.width / 2 &&
    Math.abs(player.position.z - level.exit.z) < level.exit.depth / 2
  );
}

// You were too late: lose a heart, and maybe get locked out.
function failRun() {
  console.log('Too late: the door closed');
  loseHeart();
  setState(hearts > 0 ? 'failed' : 'locked');
}

function checkStageResult() {
  if (state !== 'playing' || !running) return;

  
   // Getting through the door wins the stage (the pink pad counts too).
  if (isOnExit() || (ghosts.length > 0 && isPastDoor())) {
    setState('won');
    console.log('Stage complete');
    return;
  }

  // Once every ghost has vanished, the door is shut. If you are not
  // through it by now, you were too late.
  const ghostsFinished =
    ghosts.length > 0 && runTime > longestGhostSeconds() + FAIL_GRACE_SECONDS;
  if (ghostsFinished && !isPastDoor()) {
    failRun();
  }
}

// 22. The mini map: the whole house from above.
function mapX(x: number): number {
  return ((x + FLOOR_WIDTH / 2) / FLOOR_WIDTH) * minimap.width;
}

function mapY(z: number): number {
  return ((z + FLOOR_DEPTH / 2) / FLOOR_DEPTH) * minimap.height;
}

function mapRect(rect: Rect, color: string) {
  mapCtx.fillStyle = color;
  mapCtx.fillRect(
    mapX(rect.x - rect.width / 2),
    mapY(rect.z - rect.depth / 2),
    (rect.width / FLOOR_WIDTH) * minimap.width,
    (rect.depth / FLOOR_DEPTH) * minimap.height,
  );
}

function mapDot(x: number, z: number, color: string, radius: number) {
  mapCtx.fillStyle = color;
  mapCtx.beginPath();
  mapCtx.arc(mapX(x), mapY(z), radius, 0, Math.PI * 2);
  mapCtx.fill();
}

function drawMinimap() {
  mapCtx.clearRect(0, 0, minimap.width, minimap.height);
  mapRect({ x: 0, z: -5.75, width: FLOOR_WIDTH, depth: 6.5 }, '#3b3d46'); // balcony
  mapRect({ x: 0, z: 3.25, width: FLOOR_WIDTH, depth: 11.5 }, '#5a4630'); // house
  for (const piece of level.furniture) mapRect(piece.rect, '#8a6a4a');
  for (const wall of level.walls) mapRect(wall, '#d8ccb0');
  mapRect(level.door, doorOpen > 0.5 ? '#2ecc71' : '#e63946');
  mapRect(level.plate, `#${plateMaterial.color.getHexString()}`);
  mapRect(level.exit, '#ff6bd6');

  for (const ghost of ghosts) {
    if (ghost.visible) mapDot(ghost.x, ghost.z, '#9be7ff', 4);
  }
  mapDot(player.position.x, player.position.z, '#ffffff', 6);
  mapDot(player.position.x, player.position.z, '#4cc9f0', 4.5);
}

// 23. What is shown on top of the game, depending on the moment.
function updateOverlays() {
  const playing = state === 'playing';

  // The "out of lives" screen counts down, and unlocks when the wait is over.
  if (state === 'locked') {
    refreshLives();
    const countEl = document.getElementById('lockCount');
    if (countEl) countEl.textContent = formatCountdown(lockedUntil - Date.now());
  }

  // The bar at the top: Run 1 recording time, or Run 2 ghost time.
  const firstRun = ghosts.length === 0;
  const showBar = playing && !(!firstRun && isPastDoor());
  topbar.style.display = showBar ? 'flex' : 'none';
  if (showBar) {
    const total = firstRun ? RUN_LIMIT_SECONDS : Math.max(longestGhostSeconds(), 0.001);
    const left = Math.max(0, total - runTime);
    topbar.classList.toggle('urgent', running && left <= 2); // the last 2 seconds
    phaseEl.textContent = firstRun
      ? 'RUN 1 · RECORD YOUR GHOST'
      : 'RUN 2 · GET THROUGH THE DOOR';
    fillEl.style.width = `${((left / total) * 100).toFixed(1)}%`;
    secsEl.textContent = `${left.toFixed(1)}s`;
  }

  // One short line while you are waiting to start moving.
  const waiting = playing && !running;
  hintEl.style.display = waiting ? 'block' : 'none';
  if (waiting) {
    hintEl.textContent = firstRun
      ? 'Your clock starts when you move.'
      : 'Your ghost starts when you move.';
  }

  // The sprint bar.
  staminaBox.style.display = playing ? 'flex' : 'none';
  staminaFill.style.width = `${(stamina * 100).toFixed(0)}%`;
  staminaBox.classList.toggle('exhausted', exhausted);

  // The camera label and the mini map (only while a camera inside is on).
  const insideCamera = activeCam !== 'exterior';
  cctv.style.display = insideCamera ? 'flex' : 'none';
  minimap.style.display =
    insideCamera && viewMode === 'ceiling' ? 'block' : 'none';
  if (insideCamera) {
    const label = activeCam === 'balcony' ? 'CAM 02 · BALCONY' : 'CAM 01 · LIVING AREA';
    if (cctvLabel.textContent !== label) cctvLabel.textContent = label;
    drawMinimap();
  }
}

// 24. Keyboard: remember which keys are being held down right now.
const heldKeys = new Set<string>();

window.addEventListener('keydown', (event) => {
  if (isCustomizerOpen()) return; // the character screen handles its own keys

  // Stop the arrow keys and the space bar from scrolling the page.
  if (event.code.startsWith('Arrow') || event.code === 'Space') {
    event.preventDefault();
  }
  if (event.repeat) return; // ignore the auto-repeat of a held key

  heldKeys.add(event.code);

  // On the start and instruction screens, Enter or Space moves on.
  if (
    (event.code === 'Enter' || event.code === 'Space') &&
    (state === 'menu' || state === 'howto')
  ) {
    advanceScreens();
    return;
  }

  if (event.code === 'Enter') {
    if (state === 'playing') finishRun();
    else if (state === 'failed') retryRun();
    else if (state === 'won') restartStage();
  }
  if (event.code === 'KeyR') {
    if (state === 'playing') discardRun();
    else if (state === 'failed') retryRun();
  }
  if (
    event.code === 'KeyC' &&
    (state === 'playing' || state === 'failed' || state === 'won')
  ) {
    restartStage();
  }
  if (event.code === 'KeyC' && state === 'menu') openCharacterScreen();

  // Switch between the ceiling camera and the whole-house view.
  if (event.code === 'KeyV' && inGame()) {
    viewMode = viewMode === 'ceiling' ? 'overview' : 'ceiling';
    showMessage(viewMode === 'ceiling' ? 'Ceiling camera' : 'Whole-house view');
  }

  // Test key: refill the hearts without waiting.
  if (ENABLE_TEST_KEYS && event.code === 'KeyL') {
    hearts = MAX_HEARTS;
    lockedUntil = 0;
    saveLives();
    renderHearts();
    showMessage('Test: hearts refilled');
    if (state === 'locked') setState('menu');
  }
});

window.addEventListener('keyup', (event) => {
  heldKeys.delete(event.code);
});

window.addEventListener('blur', () => {
  heldKeys.clear();
});

// 25. Collision: would the player's box overlap this Rect at (x, z)?
function overlaps(x: number, z: number, rect: Rect): boolean {
  const half = PLAYER_SIZE / 2;
  return (
    Math.abs(x - rect.x) < rect.width / 2 + half &&
    Math.abs(z - rect.z) < rect.depth / 2 + half
  );
}

// Is the player blocked by something solid at (x, z)?
function isBlocked(x: number, z: number): boolean {
  for (const wall of level.walls) {
    if (overlaps(x, z, wall)) return true;
  }
  for (const piece of level.furniture) {
    if (overlaps(x, z, piece.rect)) return true;
  }
  // The door only blocks while it is (mostly) closed.
  if (doorOpen < 0.6 && overlaps(x, z, level.door)) return true;
  return false;
}

// 26. Movement.
const limitX = FLOOR_WIDTH / 2 - PLAYER_SIZE / 2;
const limitZ = FLOOR_DEPTH / 2 - PLAYER_SIZE / 2;

function updatePlayer(deltaSeconds: number) {
  let moving = false;
  let sprinting = false;

  // After running dry, you can sprint again once the bar has recovered a bit.
  if (exhausted && stamina >= STAMINA_RESUME) exhausted = false;

  if (state === 'playing') {
    let directionX = 0;
    let directionZ = 0;

    if (heldKeys.has('ArrowLeft') || heldKeys.has('KeyA')) directionX -= 1;
    if (heldKeys.has('ArrowRight') || heldKeys.has('KeyD')) directionX += 1;
    if (heldKeys.has('ArrowUp') || heldKeys.has('KeyW')) directionZ -= 1;
    if (heldKeys.has('ArrowDown') || heldKeys.has('KeyS')) directionZ += 1;

    if (directionX !== 0 || directionZ !== 0) {
      // The run starts the moment you start moving, even if you were
      // already holding the key when the last run was reset.
      running = true;
      moving = true;

      // Sprint: only while moving, and only while you have stamina.
      const wantsSprint =
        heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight');
      sprinting = wantsSprint && !exhausted && stamina > 0;
      if (sprinting) {
        stamina = Math.max(0, stamina - STAMINA_DRAIN * deltaSeconds);
        if (stamina <= 0) exhausted = true;
      }
      const speed = SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
      playerGait = speed / SPEED;

      const length = Math.hypot(directionX, directionZ);
      const stepX = (directionX / length) * speed * deltaSeconds;
      const stepZ = (directionZ / length) * speed * deltaSeconds;

      // Move along X, and undo it if it runs into something solid.
      const oldX = player.position.x;
      player.position.x += stepX;
      if (isBlocked(player.position.x, player.position.z)) {
        player.position.x = oldX;
      }

      // Then move along Z, the same way. This lets you slide along walls.
      const oldZ = player.position.z;
      player.position.z += stepZ;
      if (isBlocked(player.position.x, player.position.z)) {
        player.position.z = oldZ;
      }

      // Turn to face the way you are walking.
      turnTowards(
        player,
        Math.atan2(directionX / length, directionZ / length),
        deltaSeconds * 12,
      );
    }

    // Keep the person inside the house and the balcony.
    player.position.x = THREE.MathUtils.clamp(
      player.position.x,
      -limitX,
      limitX,
    );
    player.position.z = THREE.MathUtils.clamp(
      player.position.z,
      -limitZ,
      limitZ,
    );
  }

  // The afterimages only appear while you sprint.
  sprintingNow = sprinting;

  // Stamina refills whenever you are not sprinting.
  if (!sprinting) {
    stamina = Math.min(1, stamina + STAMINA_RECHARGE * deltaSeconds);
  }

  // Walking animation: ease in while moving, ease back to standing.
  const target = moving ? 1 : 0;
  playerWalkAmount +=
    (target - playerWalkAmount) * Math.min(1, deltaSeconds * 12);
  playerWalkPhase +=
    deltaSeconds * 9 * Math.max(playerWalkAmount, 0.001) * playerGait;
  poseWalk(playerPerson, playerWalkAmount, playerWalkPhase);
}

// 27. Is something standing on the pressure plate at (x, z)?
function isOnPlateAt(x: number, z: number): boolean {
  return (
    Math.abs(x - level.plate.x) < level.plate.width / 2 &&
    Math.abs(z - level.plate.z) < level.plate.depth / 2
  );
}

function updatePlateAndDoor(deltaSeconds: number) {
  // The plate is pressed by you, or by any ghost that is still around.
  const pressed =
    isOnPlateAt(player.position.x, player.position.z) ||
    ghosts.some((ghost) => ghost.visible && isOnPlateAt(ghost.x, ghost.z));

  // The plate turns green and sinks a little while pressed.
  const plateColor = pressed ? PLATE_PRESSED_COLOR : PLATE_IDLE_COLOR;
  plateMaterial.color.setHex(plateColor);
  plateMaterial.emissive.setHex(plateColor);
  plate.position.y = pressed ? 0.02 : PLATE_HEIGHT / 2;

  // The door swings towards open (1) or closed (0).
  const target = pressed ? 1 : 0;
  doorOpen += (target - doorOpen) * Math.min(1, deltaSeconds * 8);
  doorPivot.rotation.y = doorOpen * DOOR_OPEN_ANGLE;

  // The lamp above the door shows whether it is open.
  const lampColor = pressed ? LAMP_OPEN_COLOR : LAMP_CLOSED_COLOR;
  lampMaterial.color.setHex(lampColor);
  lampMaterial.emissive.setHex(lampColor);
}

// Keep the picture correct when the window changes size.
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (activeCam === 'exterior') fitCamera();
});

// 28. Start up: load the saved hearts, then show the right screen.
loadLives();
refreshLives();
renderHearts();
setState(hearts === 0 ? 'locked' : 'menu');
startRun();
const touch = createTouchControls(() => state, () => isCustomizerOpen());

// Ask start.ng who is playing. If it answers, the player wears their start.ng
// character (or start.ng's guest look). If it does not answer, the game keeps
// the character made here, so it always works.
let syncing = false;
async function syncPlayer() {
  if (syncing || isCustomizerOpen()) return;
  syncing = true;
  try {
    const player = await fetchPlayer();
    if (!player) return;
    const next: Character = { ...player.look, ghostColor: localLook.ghostColor };
    const changed =
      !fromPlatform ||
      signedIn !== player.signedIn ||
      JSON.stringify(next) !== JSON.stringify(currentLook);
    fromPlatform = true;
    signedIn = player.signedIn;
    if (changed) {
      currentLook = next;
      playerPerson.rebuild(next);
      setGhostAppearance(next);
      for (const item of afterimages) item.person.rebuild(null);
      if (state === 'menu' && !isCustomizerOpen()) renderScreen();
    }
  } finally {
    syncing = false;
  }
}

cleanAddress();
void syncPlayer();
// The player may sign in or out on start.ng in another tab, so ask again on return.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void syncPlayer();
});
window.addEventListener('focus', () => void syncPlayer());

// The game loop. The browser gives us the current time (in milliseconds)
// every frame, and we work out how long the last frame took from that.
let lastTime: number | null = null;

renderer.setAnimationLoop((time: number) => {
  // Cap the time step so a lag spike can't throw the person across the room.
  const deltaSeconds =
    lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  updatePlayer(deltaSeconds);
  updateAfterimages(deltaSeconds);
  recordRun(deltaSeconds);
  updateGhosts(deltaSeconds);
  updatePlateAndDoor(deltaSeconds);
  checkStageResult();
  updateCamera(deltaSeconds);
  updateOverlays();
  touch.update();

  // Things that move by themselves: the ceiling fans and the AC lights.
  for (const blades of fanBlades) {
    blades.rotation.y += deltaSeconds * 6;
  }
  acLedMaterial.emissiveIntensity = Math.sin((time / 1000) * 2.5) > 0.3 ? 1.2 : 0.1;

  // The whole-house view cuts the front wall down and fades the roof, so you
  // can see inside. Every other view keeps the house sealed.
  const cutaway = viewMode === 'overview' && inGame();
  frontWall.visible = !cutaway;
  frontLow.visible = cutaway;
  const roofTarget = cutaway ? ROOF_PLAY_OPACITY : 1;
  roofOpacity += (roofTarget - roofOpacity) * Math.min(1, deltaSeconds * 3);
  for (const material of roofMaterials) {
    material.opacity = roofOpacity;
    material.depthWrite = roofOpacity > 0.98;
  }

  renderer.render(scene, camera);
});