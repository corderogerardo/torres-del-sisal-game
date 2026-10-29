// Input adapter: keyboard, mouse look, pointer lock, visibility and fallback
// look behind a small state interface. Target and document are injected so the
// adapter runs under Node tests without a browser. No imports, no module-scope
// DOM globals, no Three.js, network or storage.

const LOOK_FACTOR = 0.0022;
const PITCH_LIMIT = 1.2;
const DEFAULT_SENSITIVITY = 0.55;
const PREVENT_DEFAULT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(node) {
  if (!node) return false;
  return EDITABLE_TAGS.has(node.tagName) || Boolean(node.isContentEditable);
}

function normalizeSensitivity(value) {
  return Number.isFinite(value) ? value : DEFAULT_SENSITIVITY;
}

export function createInputController({
  target = globalThis,
  document = globalThis.document,
  sensitivity = DEFAULT_SENSITIVITY,
  isActive = () => true,
  onAction = () => {},
} = {}) {
  const keys = {};
  let yaw = 0;
  let pitch = 0;
  let cursor = null;
  let pointerLocked = Boolean(document && document.pointerLockElement);
  let fallbackLook = false;
  let lookSensitivity = normalizeSensitivity(sensitivity);
  let bound = false;

  function emit(action) {
    if (typeof onAction === 'function') onAction(action);
  }

  function onKeyDown(event) {
    if (isEditableTarget(event.target)) return;
    const code = event.code;
    keys[code] = true;
    if (PREVENT_DEFAULT_CODES.has(code)) event.preventDefault();
    if (code === 'KeyF') emit({ type: 'torchToggle' });
    else if (code === 'KeyE') emit({ type: 'hideToggle' });
    else if (code === 'Escape' && fallbackLook) emit({ type: 'pause' });
  }

  function onKeyUp(event) {
    if (isEditableTarget(event.target)) return;
    keys[event.code] = false;
  }

  function onMouseMove(event) {
    cursor = { x: event.clientX, y: event.clientY };
    if (!pointerLocked && !fallbackLook) return;
    if (!isActive()) return;
    const factor = lookSensitivity * LOOK_FACTOR;
    yaw -= event.movementX * factor;
    pitch -= event.movementY * factor;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }

  function onPointerLockChange() {
    pointerLocked = Boolean(document && document.pointerLockElement);
    if (pointerLocked) fallbackLook = false;
  }

  function onVisibilityChange() {
    emit({ type: 'visibility', hidden: Boolean(document && document.hidden) });
  }

  function bind() {
    if (bound) return;
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    bound = true;
  }

  function unbind() {
    if (!bound) return;
    bound = false;
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function getState() {
    return {
      keys: { ...keys },
      yaw,
      pitch,
      cursor: cursor ? { x: cursor.x, y: cursor.y } : null,
      pointerLocked,
      fallbackLook,
    };
  }

  function setSensitivity(value) {
    if (Number.isFinite(value)) lookSensitivity = value;
  }

  function setFallbackLook(enabled) {
    fallbackLook = Boolean(enabled);
  }

  function setLook(nextYaw, nextPitch) {
    yaw = Number.isFinite(nextYaw) ? nextYaw : yaw;
    pitch = Number.isFinite(nextPitch)
      ? Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, nextPitch))
      : pitch;
  }

  function resetLook() {
    yaw = 0;
    pitch = 0;
  }

  return {
    bind,
    unbind,
    getState,
    setSensitivity,
    setFallbackLook,
    setLook,
    resetLook,
  };
}
