// Talks to start.ng (the platform): who is playing, and what their character
// looks like. The rules come from https://start.ng/docs.md
//
// The game asks start.ng's hidden "connect" page through postMessage. That page
// only answers games that are served from a *.start.ng address. Anywhere else
// (a local test, for example) it stays silent, and the game uses its own
// character instead.
import { DEFAULT_CHARACTER } from './character';
import type { Character, Face, Extra, HairStyle, Hat } from './character';

const START_NG = 'https://start.ng';

let frame: Promise<HTMLIFrameElement> | undefined;

// Add the hidden connect page once, and wait for it to load.
function connectFrame(): Promise<HTMLIFrameElement> {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('connect page failed to load'));
    document.body.append(el);
  });
  return frame;
}

// Send start.ng a message. Resolves to its reply, or null if it did not answer.
export async function askStartNg(
  message: Record<string, unknown>,
  replyType: string,
  timeoutMs = 4000,
): Promise<Record<string, unknown> | null> {
  let el: HTMLIFrameElement;
  try {
    el = await Promise.race([
      connectFrame(),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply: Record<string, unknown> | null) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    function onMessage(e: MessageEvent) {
      // Always check where a reply came from. This is what makes it trustworthy.
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      const data = e.data as Record<string, unknown> | null;
      if (data?.type === replyType && data.requestId === requestId) done(data);
    }
    window.addEventListener('message', onMessage);
    el.contentWindow?.postMessage({ ...message, requestId }, START_NG);
  });
}

// ---------- Turning start.ng's character into the game's character ----------
const HAIR: readonly HairStyle[] = ['short', 'afro', 'bun', 'ponytail', 'braids', 'dreads', 'bald'];
const HATS: readonly Hat[] = ['none', 'cap', 'beanie', 'tophat', 'crown'];

function colour(value: unknown, fallback: number): number {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? parseInt(value.slice(1), 16)
    : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

// Any missing or unknown value falls back to something sensible, because
// start.ng may add more options later.
export function styleToCharacter(style: unknown, name: string): Character {
  const s = (style && typeof style === 'object' ? style : {}) as Record<string, unknown>;
  const d = DEFAULT_CHARACTER;
  const accessory = typeof s.accessory === 'string' ? s.accessory : 'none';
  const face: Face =
    accessory === 'glasses' ? 'glasses' : accessory === 'earrings' ? 'earrings' : accessory === 'beard' ? 'beard' : 'none';
  const extra: Extra = accessory === 'scarf' ? 'scarf' : accessory === 'backpack' ? 'backpack' : 'none';
  return {
    body: s.body === 'male' ? 'male' : s.body === 'female' ? 'female' : d.body,
    name: name.slice(0, 24),
    skin: colour(s.skinColor, d.skin),
    hairStyle: oneOf(s.hair, HAIR, d.hairStyle),
    hair: colour(s.hairColor, d.hair),
    top: colour(s.primaryColor, d.top),
    bottom: colour(s.secondaryColor, d.bottom),
    hat: oneOf(s.hat, HATS, 'none'),
    face,
    extra,
    ghostColor: d.ghostColor, // the ghost's glow is the player's own choice in this game
  };
}

export type PlatformPlayer = {
  signedIn: boolean;
  look: Character;
};

// Who is playing? A signed-in player, start.ng's guest, or null if start.ng
// did not answer (for example when the game is not running on *.start.ng).
export async function fetchPlayer(): Promise<PlatformPlayer | null> {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return null;
  const user = reply.user as { name?: unknown; style?: unknown } | null | undefined;
  const guest = reply.guest as { style?: unknown } | null | undefined;
  if (user && typeof user === 'object') {
    const name = typeof user.name === 'string' && user.name.trim() ? user.name : 'Player';
    return { signedIn: true, look: styleToCharacter(user.style, name) };
  }
  if (guest && typeof guest === 'object') {
    return { signedIn: false, look: styleToCharacter(guest.style, 'Guest') };
  }
  return null;
}

// Send the player to start.ng to sign in, with a link back to this game.
export function signInUrl(): string {
  return `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// After signing in, start.ng sends the player back with a session in the
// address. This game uses the connect page, so it does not need the session:
// just remove it from the address bar.
export function cleanAddress() {
  if (location.hash.includes('startng_session')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}
