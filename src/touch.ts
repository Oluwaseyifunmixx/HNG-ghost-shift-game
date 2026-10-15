// Touch controls for phones and tablets. They press the same keys the
// keyboard does, so the game itself does not need to change.

export const IS_TOUCH: boolean = window.matchMedia('(pointer: coarse)').matches;

type TouchControls = { update: () => void };

function make(tag: 'div' | 'button', className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createTouchControls(
  getState: () => string,
  isBlocked: () => boolean,
): TouchControls {
  if (!IS_TOUCH) return { update: () => {} };

  // ---------- Pretend keys ----------
  const held = new Set<string>();
  const fire = (type: 'keydown' | 'keyup', code: string) => {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code }));
  };
  const setHeld = (code: string, on: boolean) => {
    if (on && !held.has(code)) {
      held.add(code);
      fire('keydown', code);
    } else if (!on && held.has(code)) {
      held.delete(code);
      fire('keyup', code);
    }
  };
  const tap = (code: string) => {
    fire('keydown', code);
    fire('keyup', code);
  };
  const releaseAll = () => {
    for (const code of [...held]) setHeld(code, false);
  };
  window.addEventListener('blur', releaseAll);

  // ---------- The joystick ----------
  const stick = make('div', 'tc tc-stick');
  const knob = make('div', 'tc-knob');
  stick.appendChild(knob);
  let stickId: number | null = null;
  const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

  const moveStick = (e: PointerEvent) => {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = radius * 0.3;
    setHeld('ArrowLeft', dx < -dead);
    setHeld('ArrowRight', dx > dead);
    setHeld('ArrowUp', dy < -dead);
    setHeld('ArrowDown', dy > dead);
  };
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    arrows.forEach((code) => setHeld(code, false));
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  // ---------- Buttons ----------
  const holdButton = (node: HTMLElement, code: string) => {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      node.classList.add('on');
      setHeld(code, true);
    });
    const off = () => {
      node.classList.remove('on');
      setHeld(code, false);
    };
    node.addEventListener('pointerup', off);
    node.addEventListener('pointercancel', off);
  };
  const tapButton = (node: HTMLElement, code: string) => {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tap(code);
    });
  };

  const sprint = make('button', 'tc tc-btn tc-sprint', 'SPRINT');
  const save = make('button', 'tc tc-btn tc-save', 'SAVE');
  const restart = make('button', 'tc tc-btn tc-small tc-restart', 'RESTART');
  const view = make('button', 'tc tc-btn tc-small tc-view', 'CAMERA');
  holdButton(sprint, 'ShiftLeft');
  tapButton(save, 'Enter');
  tapButton(restart, 'KeyR');
  tapButton(view, 'KeyV');

  const endRow = make('div', 'tc tc-center');
  const retry = make('button', 'tc-btn tc-big', 'TRY AGAIN');
  const fresh = make('button', 'tc-btn tc-big', 'NEW RUN');
  tapButton(retry, 'Enter');
  tapButton(fresh, 'KeyC');
  endRow.append(retry, fresh);

  const wonRow = make('div', 'tc tc-center');
  const again = make('button', 'tc-btn tc-big', 'PLAY AGAIN');
  tapButton(again, 'Enter');
  wonRow.append(again);

  const rotate = make('div', 'tc-rotate');
  rotate.innerHTML =
    '<div><div class="tc-rotate-icon">↻</div>Rotate your phone<br>' +
    '<small>Ghost Shift plays best in landscape</small></div>';

  const everything = [stick, sprint, save, restart, view, endRow, wonRow, rotate];
  everything.forEach((node) => {
    node.style.display = 'none';
    document.body.appendChild(node);
  });

  // ---------- Show the right controls for the moment ----------
  let lastMode = '';
  const show = (node: HTMLElement, visible: boolean, display = 'flex') => {
    node.style.display = visible ? display : 'none';
  };

  const update = () => {
    const state = getState();
    const mode = isBlocked() ? 'blocked' : state;
    if (mode !== lastMode) {
      lastMode = mode;
      releaseAll();
      stickId = null;
      knob.style.transform = '';
      const playing = mode === 'playing';
      show(stick, playing, 'block');
      show(sprint, playing);
      show(save, playing);
      show(restart, playing);
      show(view, playing);
      show(endRow, mode === 'failed');
      show(wonRow, mode === 'won');
    }
    const inGame = state === 'playing' || state === 'failed' || state === 'won';
    show(rotate, inGame && window.innerHeight > window.innerWidth);
  };

  return { update };
}