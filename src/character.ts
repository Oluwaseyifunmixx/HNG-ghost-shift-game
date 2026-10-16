import * as THREE from 'three';

// ---------- The character is just data ----------
// The platform's character will replace this later (see getPlatformCharacter).
export type BodyType = 'female' | 'male';
export type HairStyle =
  | 'short'
  | 'afro'
  | 'bun'
  | 'ponytail'
  | 'braids'
  | 'dreads'
  | 'bald';
export type Hat = 'none' | 'cap' | 'beanie' | 'tophat' | 'crown' | 'halo';
export type Face = 'none' | 'glasses' | 'goggles' | 'earrings' | 'beard';
export type Extra =
  | 'none'
  | 'scarf'
  | 'backpack'
  | 'clockpack'
  | 'watch'
  | 'cape';

export type Character = {
  body: BodyType;
  name: string;
  skin: number;
  hairStyle: HairStyle;
  hair: number;
  top: number;
  bottom: number;
  hat: Hat;
  face: Face;
  extra: Extra;
  ghostColor: number;
};

type Choice<T extends string> = { value: T; label: string };

export const BODIES: readonly Choice<BodyType>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];
export const HAIR_STYLES: readonly Choice<HairStyle>[] = [
  { value: 'short', label: 'Short' },
  { value: 'afro', label: 'Afro' },
  { value: 'bun', label: 'Bun' },
  { value: 'ponytail', label: 'Ponytail' },
  { value: 'braids', label: 'Braids' },
  { value: 'dreads', label: 'Dreads' },
  { value: 'bald', label: 'Bald' },
];
export const HATS: readonly Choice<Hat>[] = [
  { value: 'none', label: 'None' },
  { value: 'cap', label: 'Cap' },
  { value: 'beanie', label: 'Beanie' },
  { value: 'tophat', label: 'Top hat' },
  { value: 'crown', label: 'Crown' },
  { value: 'halo', label: 'Halo' },
];
export const FACES: readonly Choice<Face>[] = [
  { value: 'none', label: 'None' },
  { value: 'glasses', label: 'Glasses' },
  { value: 'goggles', label: 'Time goggles' },
  { value: 'earrings', label: 'Earrings' },
  { value: 'beard', label: 'Beard' },
];
export const EXTRAS: readonly Choice<Extra>[] = [
  { value: 'none', label: 'None' },
  { value: 'scarf', label: 'Scarf' },
  { value: 'backpack', label: 'Backpack' },
  { value: 'clockpack', label: 'Clock pack' },
  { value: 'watch', label: 'Pocket watch' },
  { value: 'cape', label: 'Cape' },
];

export const SKINS: readonly number[] = [
  0x5c3a21, 0x8a5a2b, 0xa8703a, 0xc68642, 0xe0b074, 0xf1c27d,
];
export const HAIR_COLOURS: readonly number[] = [
  0x16120e, 0x4a2c1a, 0x8b5a2b, 0xdfa73a, 0xb8b8b8, 0xc0392b,
];
export const TOP_COLOURS: readonly number[] = [
  0xff6b6b, 0x1fd1a0, 0x9b5de5, 0x4a7de8, 0xf7b92c, 0xff9a3c, 0xe8416b,
  0x23272b,
];
export const BOTTOM_COLOURS: readonly number[] = [
  0x2b3256, 0x1f2b44, 0x3f3f3f, 0x4c6a8c, 0x5b3fc9, 0x0f7a5d,
];
export const GHOST_COLOURS: readonly number[] = [
  0x9be7ff, 0xc9a0ff, 0xffb3d1, 0xa6ffcb, 0xffe08a, 0xffffff,
];

export const DEFAULT_CHARACTER: Character = {
  body: 'female',
  name: '',
  skin: SKINS[1],
  hairStyle: 'short',
  hair: HAIR_COLOURS[0],
  top: TOP_COLOURS[3],
  bottom: BOTTOM_COLOURS[2],
  hat: 'none',
  face: 'none',
  extra: 'none',
  ghostColor: GHOST_COLOURS[0],
};

// ---------- Saving, loading, and the platform hook ----------
const CHARACTER_KEY = 'ghostShift.character.v1';

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function loadCharacter(): Character {
  try {
    const raw = localStorage.getItem(CHARACTER_KEY);
    if (!raw) return { ...DEFAULT_CHARACTER };
    const saved = JSON.parse(raw) as Partial<Record<keyof Character, unknown>>;
    const d = DEFAULT_CHARACTER;
    return {
      body: pick(saved.body, BODIES.map((o) => o.value), d.body),
      name: typeof saved.name === 'string' ? saved.name.slice(0, 14) : '',
      skin: pick(saved.skin, SKINS, d.skin),
      hairStyle: pick(saved.hairStyle, HAIR_STYLES.map((o) => o.value), d.hairStyle),
      hair: pick(saved.hair, HAIR_COLOURS, d.hair),
      top: pick(saved.top, TOP_COLOURS, d.top),
      bottom: pick(saved.bottom, BOTTOM_COLOURS, d.bottom),
      hat: pick(saved.hat, HATS.map((o) => o.value), d.hat),
      face: pick(saved.face, FACES.map((o) => o.value), d.face),
      extra: pick(saved.extra, EXTRAS.map((o) => o.value), d.extra),
      ghostColor: pick(saved.ghostColor, GHOST_COLOURS, d.ghostColor),
    };
  } catch {
    return { ...DEFAULT_CHARACTER };
  }
}

export function saveCharacter(look: Character) {
  try {
    localStorage.setItem(CHARACTER_KEY, JSON.stringify(look));
  } catch {
    // Storage can be blocked. The character just won't be remembered.
  }
}

// When the start.ng platform gives us a character, return it here.
// Until we know its format, there is none, so the game uses your own.
export function getPlatformCharacter(): Character | null {
  return null;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch]);
}

// ---------- The person: built from simple parts ----------
const PERSON_SCALE = 1.35; // how big the person looks
const SHOES = 0x16181d;
const GOLD = 0xd4af37;

export type Person = {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  rebuild: (look: Character | null) => void;
};

// Every ghost shares this see-through material. Its colour is your choice.
export const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 0x9be7ff,
  emissive: 0x3aa0d8,
  emissiveIntensity: 0.7,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
let ghostBody: BodyType = 'female';

export function setGhostAppearance(look: Character) {
  ghostMaterial.color.setHex(look.ghostColor);
  ghostMaterial.emissive.setHex(look.ghostColor);
  ghostMaterial.emissive.multiplyScalar(0.55);
  ghostBody = look.body;
}

function clearGroup(group: THREE.Group, disposeMaterials: boolean) {
  const old = [...group.children];
  for (const child of old) {
    group.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (disposeMaterials) {
          const material = node.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      }
    });
  }
}

type PartOptions = { rough?: number; metal?: number; glow?: number };

function fillPerson(
  person: Person,
  look: Character | null,
  override?: THREE.Material,
) {
  const group = person.group;
  const c: Character = look ?? DEFAULT_CHARACTER; // colours are ignored for ghosts
  const bodyType: BodyType = look ? look.body : ghostBody;
  const bodyWidth = bodyType === 'female' ? 0.46 : 0.54;
  const shoulder = bodyWidth / 2 + 0.09;
  const hip = 0.13;

  // Make a part. A ghost uses the shared ghost material for everything.
  const make = (
    geometry: THREE.BufferGeometry,
    color: number,
    options: PartOptions = {},
  ): THREE.Mesh => {
    let material: THREE.Material;
    if (look === null) {
      material = override ?? ghostMaterial;
    } else {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: options.rough ?? 0.8,
        metalness: options.metal ?? 0,
        emissive: options.glow !== undefined ? color : 0x000000,
        emissiveIntensity: options.glow ?? 0,
      });
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = look !== null; // ghosts do not cast shadows
    return mesh;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    color: number,
    options?: PartOptions,
  ) => make(new THREE.BoxGeometry(w, h, d), color, options);
  const place = (
    mesh: THREE.Mesh,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Legs and arms hang from joints, so swinging looks natural.
  const makeLeg = (sideX: number): THREE.Group => {
    const joint = new THREE.Group();
    joint.position.set(sideX, 0.6, 0);
    place(box(0.22, 0.5, 0.24, c.bottom), 0, -0.25, 0, joint);
    place(box(0.24, 0.1, 0.34, SHOES), 0, -0.55, 0.05, joint);
    group.add(joint);
    return joint;
  };
  const makeArm = (sideX: number): THREE.Group => {
    const joint = new THREE.Group();
    joint.position.set(sideX, 1.15, 0);
    place(box(0.18, 0.32, 0.2, c.top), 0, -0.16, 0, joint);
    place(box(0.16, 0.22, 0.18, c.skin), 0, -0.43, 0, joint);
    group.add(joint);
    return joint;
  };
  person.leftLeg = makeLeg(-hip);
  person.rightLeg = makeLeg(hip);
  person.leftArm = makeArm(-shoulder);
  person.rightArm = makeArm(shoulder);

  // Body, a belt, the head, eyes and a nose.
  place(box(bodyWidth, 0.6, 0.28, c.top), 0, 0.9, 0);
  place(box(bodyWidth + 0.02, 0.06, 0.3, 0x2b2b2b), 0, 0.64, 0);
  place(box(0.34, 0.34, 0.34, c.skin), 0, 1.44, 0);
  place(box(0.06, 0.06, 0.06, c.skin), 0, 1.42, 0.2);
  for (const side of [-1, 1]) {
    place(box(0.04, 0.04, 0.02, 0x111111), side * 0.08, 1.47, 0.171);
  }

  // Hair.
  const hairCap = () => {
    place(box(0.38, 0.14, 0.38, c.hair), 0, 1.64, 0);
    place(box(0.38, 0.2, 0.07, c.hair), 0, 1.52, -0.17);
  };
  switch (c.hairStyle) {
    case 'short':
      hairCap();
      break;
    case 'afro':
      place(make(new THREE.SphereGeometry(0.31, 18, 14), c.hair), 0, 1.62, -0.02);
      break;
    case 'bun':
      hairCap();
      place(make(new THREE.SphereGeometry(0.12, 12, 10), c.hair), 0, 1.8, -0.06);
      break;
    case 'ponytail':
      hairCap();
      place(box(0.11, 0.36, 0.11, c.hair), 0, 1.42, -0.26);
      break;
    case 'braids':
      hairCap();
      for (const side of [-1, 1]) {
        place(box(0.07, 0.42, 0.07, c.hair), side * 0.17, 1.32, -0.1);
      }
      break;
    case 'dreads':
      hairCap();
      for (const x of [-0.15, -0.05, 0.05, 0.15]) {
        place(box(0.055, 0.4, 0.055, c.hair), x, 1.34, -0.19);
      }
      for (const side of [-1, 1]) {
        place(box(0.055, 0.32, 0.055, c.hair), side * 0.19, 1.38, -0.04);
      }
      break;
    case 'bald':
      break;
  }

  // Hats.
  switch (c.hat) {
    case 'none':
      break;
    case 'cap':
      place(box(0.41, 0.1, 0.41, c.top), 0, 1.7, 0);
      place(box(0.3, 0.03, 0.2, c.top), 0, 1.66, 0.28);
      break;
    case 'beanie':
      place(box(0.41, 0.2, 0.41, c.top), 0, 1.72, 0);
      place(make(new THREE.SphereGeometry(0.07, 10, 8), 0xffffff), 0, 1.86, 0);
      break;
    case 'tophat':
      place(make(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 22), 0x1c1c22), 0, 1.69, 0);
      place(make(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 20), 0x1c1c22), 0, 1.86, 0);
      place(make(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 20), 0xc0392b), 0, 1.74, 0);
      break;
    case 'crown': {
      place(box(0.38, 0.1, 0.38, GOLD, { metal: 0.6, rough: 0.3 }), 0, 1.72, 0);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          place(box(0.07, 0.12, 0.07, GOLD, { metal: 0.6, rough: 0.3 }), sx * 0.15, 1.82, sz * 0.15);
        }
      }
      break;
    }
    case 'halo': {
      const ring = make(new THREE.TorusGeometry(0.22, 0.03, 10, 28), 0xffe9a3, { glow: 1.2 });
      ring.rotation.x = Math.PI / 2;
      place(ring, 0, 1.98, 0);
      break;
    }
  }

  // Face.
  if (c.face === 'glasses') {
    for (const side of [-1, 1]) {
      place(box(0.12, 0.1, 0.02, 0x15151a), side * 0.085, 1.47, 0.18);
      place(box(0.09, 0.07, 0.025, 0x9bd4ff, { glow: 0.4 }), side * 0.085, 1.47, 0.186);
    }
    place(box(0.06, 0.015, 0.02, 0x15151a), 0, 1.48, 0.18);
  } else if (c.face === 'goggles') {
    place(box(0.37, 0.05, 0.37, 0x6b4a2f), 0, 1.57, 0);
    for (const side of [-1, 1]) {
      const rim = make(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 16), GOLD, { metal: 0.6, rough: 0.3 });
      rim.rotation.x = Math.PI / 2;
      place(rim, side * 0.085, 1.57, 0.2);
      const lens = make(new THREE.CylinderGeometry(0.055, 0.055, 0.075, 16), 0xffb347, { glow: 0.9 });
      lens.rotation.x = Math.PI / 2;
      place(lens, side * 0.085, 1.57, 0.2);
    }
  }

  if (c.face === 'earrings') {
    for (const side of [-1, 1]) {
      place(box(0.04, 0.09, 0.04, GOLD, { metal: 0.6, rough: 0.3 }), side * 0.19, 1.37, 0.02);
    }
  } else if (c.face === 'beard') {
    place(box(0.3, 0.12, 0.09, c.hair), 0, 1.34, 0.165);
    place(box(0.34, 0.2, 0.05, c.hair), 0, 1.36, 0.14);
  }

  // Extras.
  switch (c.extra) {
    case 'none':
      break;
    case 'scarf':
      place(box(0.4, 0.1, 0.34, 0xc0392b), 0, 1.24, 0);
      place(box(0.1, 0.34, 0.04, 0xc0392b), 0.1, 1.05, 0.17);
      break;
    case 'backpack':
      place(box(0.38, 0.5, 0.18, 0x6b4a2f), 0, 0.95, -0.23);
      place(box(0.3, 0.16, 0.04, 0x57391f), 0, 0.82, -0.34);
      break;
    case 'clockpack': {
      place(box(0.4, 0.52, 0.2, 0x4a3322), 0, 0.95, -0.24);
      const face = make(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 20), 0xf3e9d2);
      face.rotation.x = Math.PI / 2;
      place(face, 0, 1.0, -0.355);
      place(make(new THREE.TorusGeometry(0.15, 0.02, 8, 22), GOLD, { metal: 0.6, rough: 0.3 }), 0, 1.0, -0.36);
      place(box(0.02, 0.1, 0.01, 0x222222), 0, 1.05, -0.375);
      const minute = box(0.02, 0.07, 0.01, 0x222222);
      minute.rotation.z = -1.1;
      place(minute, 0.03, 1.0, -0.375);
      break;
    }
    case 'watch': {
      place(box(0.012, 0.22, 0.012, GOLD, { metal: 0.6, rough: 0.3 }), 0.19, 0.78, 0.15);
      const watch = make(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 18), GOLD, { metal: 0.6, rough: 0.3 });
      watch.rotation.x = Math.PI / 2;
      place(watch, 0.19, 0.66, 0.17);
      const dial = make(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 18), 0xf3e9d2);
      dial.rotation.x = Math.PI / 2;
      place(dial, 0.19, 0.66, 0.186);
      break;
    }
    case 'cape':
      place(box(bodyWidth + 0.1, 0.8, 0.04, 0x6a3fb5), 0, 0.82, -0.19);
      break;
  }
}

// One builder for everyone. With no look (a ghost), every part uses the
// ghost material. "rebuild" swaps the look without replacing the person.
export function buildPerson(
  look: Character | null,
  override?: THREE.Material,
): Person {
  const group = new THREE.Group();
  group.scale.setScalar(PERSON_SCALE);
  const person: Person = {
    group,
    leftArm: new THREE.Group(),
    rightArm: new THREE.Group(),
    leftLeg: new THREE.Group(),
    rightLeg: new THREE.Group(),
    rebuild: () => {},
  };
  let ownsMaterials = false;
  person.rebuild = (next) => {
    clearGroup(group, ownsMaterials);
    ownsMaterials = next !== null;
    fillPerson(person, next, override);
  };
  person.rebuild(look);
  return person;
}

// ---------- The character screen ----------
type CustomizerOptions = {
  current: Character;
  onChange: (look: Character) => void;
  onClose: () => void;
  // When the character comes from start.ng, only the ghost's glow can be changed.
  ghostOnly?: boolean;
  note?: string;
};
type AnyChoice = { value: string; label: string };

export function isCustomizerOpen(): boolean {
  return document.getElementById('customizer') !== null;
}

function pickOne<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function openCustomizer(options: CustomizerOptions) {
  if (isCustomizerOpen()) return;
  const look: Character = { ...options.current };

  const root = document.createElement('div');
  root.id = 'customizer';
  root.innerHTML =
    '<div class="cz-panel">' +
    '<div class="cz-preview"><div class="cz-title">YOUR CHARACTER</div>' +
    '<div class="cz-stage"></div><div class="cz-hint">Drag to turn</div></div>' +
    '<div class="cz-controls"></div></div>';
  document.body.appendChild(root);

  // Keys typed in here must not reach the game.
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  root.addEventListener('keyup', (e) => e.stopPropagation());

  // The little 3D preview.
  const stage = root.querySelector<HTMLDivElement>('.cz-stage')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(300, 340);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 300 / 340, 0.1, 50);
  camera.position.set(0, 1.5, 6);
  camera.lookAt(0, 1.3, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(2, 4, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9be7ff, 0.8);
  rimLight.position.set(-3, 2, -3);
  scene.add(rimLight);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.04, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a3145 }),
  );
  disc.position.y = -0.02;
  scene.add(disc);

  const person = buildPerson(look);
  person.group.rotation.y = 0.5;
  scene.add(person.group);

  // Drag to turn.
  let dragging = false;
  let lastX = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    person.group.rotation.y += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const stopDrag = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  let frame = 0;
  const tick = () => {
    if (!dragging) person.group.rotation.y += 0.01;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  tick();

  // The controls.
  const controls = root.querySelector<HTMLDivElement>('.cz-controls')!;
  const refreshers: Array<() => void> = [];
  const record = look as unknown as Record<string, unknown>;

  const commit = () => {
    person.rebuild(look);
    options.onChange({ ...look });
    refreshers.forEach((fn) => fn());
  };
  const change = (key: string, value: string | number) => {
    record[key] = value;
    commit();
  };
  const addLabel = (text: string) => {
    const el = document.createElement('div');
    el.className = 'cz-label';
    el.textContent = text;
    controls.appendChild(el);
  };

  const addChoices = (label: string, key: string, choices: readonly AnyChoice[]) => {
    addLabel(label);
    const row = document.createElement('div');
    row.className = 'cz-row';
    const buttons: HTMLButtonElement[] = [];
    choices.forEach((choice) => {
      const b = document.createElement('button');
      b.className = 'cz-choice';
      b.textContent = choice.label;
      b.addEventListener('click', () => change(key, choice.value));
      row.appendChild(b);
      buttons.push(b);
    });
    controls.appendChild(row);
    refreshers.push(() => {
      buttons.forEach((b, i) => b.classList.toggle('on', choices[i].value === record[key]));
    });
  };

  const addSwatches = (label: string, key: string, colours: readonly number[]) => {
    addLabel(label);
    const row = document.createElement('div');
    row.className = 'cz-row';
    const buttons: HTMLButtonElement[] = [];
    colours.forEach((colour) => {
      const b = document.createElement('button');
      b.className = 'cz-swatch';
      b.style.background = `#${colour.toString(16).padStart(6, '0')}`;
      b.setAttribute('aria-label', `${label} colour`);
      b.addEventListener('click', () => change(key, colour));
      row.appendChild(b);
      buttons.push(b);
    });
    controls.appendChild(row);
    refreshers.push(() => {
      buttons.forEach((b, i) => b.classList.toggle('on', colours[i] === record[key]));
    });
  };

  if (options.note) {
    const note = document.createElement('div');
    note.className = 'cz-note';
    note.textContent = options.note;
    controls.appendChild(note);
  }

  if (!options.ghostOnly) {
  addChoices('BODY', 'body', BODIES);

  addLabel('NAME');
  const nameInput = document.createElement('input');
  nameInput.className = 'cz-name';
  nameInput.maxLength = 14;
  nameInput.placeholder = 'Your name';
  nameInput.value = look.name;
  nameInput.addEventListener('input', () => {
    look.name = nameInput.value;
    options.onChange({ ...look });
  });
  controls.appendChild(nameInput);

  addSwatches('SKIN', 'skin', SKINS);
  addChoices('HAIR', 'hairStyle', HAIR_STYLES);
  addSwatches('HAIR COLOUR', 'hair', HAIR_COLOURS);
  addSwatches('TOP', 'top', TOP_COLOURS);
  addSwatches('BOTTOMS', 'bottom', BOTTOM_COLOURS);
  addChoices('HAT', 'hat', HATS);
  addChoices('FACE', 'face', FACES);
  addChoices('EXTRA', 'extra', EXTRAS);
  }
  addSwatches("YOUR GHOST'S GLOW", 'ghostColor', GHOST_COLOURS);

  const actions = document.createElement('div');
  actions.className = 'cz-actions';
  const surprise = document.createElement('button');
  surprise.className = 'cz-btn';
  surprise.textContent = 'Surprise me';
  surprise.addEventListener('click', () => {
    look.body = pickOne(BODIES).value;
    look.skin = pickOne(SKINS);
    look.hairStyle = pickOne(HAIR_STYLES).value;
    look.hair = pickOne(HAIR_COLOURS);
    look.top = pickOne(TOP_COLOURS);
    look.bottom = pickOne(BOTTOM_COLOURS);
    look.hat = pickOne(HATS).value;
    look.face = pickOne(FACES).value;
    look.extra = pickOne(EXTRAS).value;
    look.ghostColor = pickOne(GHOST_COLOURS);
    commit();
  });
  const done = document.createElement('button');
  done.className = 'cz-btn primary';
  done.textContent = 'Done';
  done.addEventListener('click', () => close());
  if (!options.ghostOnly) actions.appendChild(surprise);
  actions.appendChild(done);
  controls.appendChild(actions);

  refreshers.forEach((fn) => fn());

  function close() {
    cancelAnimationFrame(frame);
    renderer.dispose();
    renderer.forceContextLoss();
    root.remove();
    options.onClose();
  }
}