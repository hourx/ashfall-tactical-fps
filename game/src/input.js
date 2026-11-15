// Keyboard and pointer-lock mouse. Holds the held-key set, accumulates mouse motion,
// and queues one-shot actions (reload, buy, plant, weapon slots) for the tick to drain.
export function createInput(canvas, onLockChange) {
  const held = new Set();
  const queued = [];
  const mouse = { dx: 0, dy: 0 };
  let locked = false;
  let sawPointer = false;

  const ONESHOT = new Set([
    'KeyR', 'KeyB', 'KeyE', 'KeyQ', 'KeyG', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Escape',
  ]);

  function down(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (ONESHOT.has(event.code)) queued.push(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function up(event) {
    held.delete(event.code);
  }

  function move(event) {
    if (!locked) return;
    mouse.dx += event.movementX || 0;
    mouse.dy += event.movementY || 0;
    sawPointer = true;
  }

  function lockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      held.clear();
      mouse.dx = 0;
      mouse.dy = 0;
    }
    onLockChange(locked);
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('mousemove', move);
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('pointerlockchange', lockChange);
  canvas.addEventListener('mousedown', () => {
    if (!locked) requestLock();
  });

  // Chrome returns a promise here and rejects it when the gesture is not trusted
  // (headless runs, synthetic clicks). Swallow that instead of logging it.
  function requestLock() {
    try {
      const pending = canvas.requestPointerLock?.();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // Pointer lock is not available in this context.
    }
  }

  // Drains queued one-shot codes; each is consumed once.
  function takeActions() {
    const out = queued.slice();
    queued.length = 0;
    return out;
  }

  // Drains the mouse delta so a tick never reuses motion.
  function takeMouse() {
    const out = { dx: mouse.dx, dy: mouse.dy };
    mouse.dx = 0;
    mouse.dy = 0;
    return out;
  }

  return {
    held,
    takeActions,
    takeMouse,
    requestLock,
    hasPointer: () => sawPointer,
    isLocked: () => locked,
    forward: () => (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0),
    strafe: () => (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
    crouch: () => held.has('ControlLeft') || held.has('KeyC'),
    walk: () => held.has('ShiftLeft'),
    firing: () => locked && (held.has('Mouse0') || held.has('Mouse2')),
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChange);
    },
  };
}
