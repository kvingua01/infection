export const controllerActions = {
  jump: ["Jump", 0],
  throw: ["Throw Projectile", 7],
  use: ["Activate Power-Up", 2],
  slot1: ["Select Power-up Slot 1", 14],
  slot2: ["Select Power-up Slot 2", 15],
  settings: ["Open Settings", 9],
  camera: ["Switch Camera", 3],
  scores: ["Show Scores", 8],
};
const defaults = {
  sensitivity: 1, horizontal: 1, vertical: 1, invertY: false,
  leftDeadzone: 0.18, rightDeadzone: 0.18, vibration: true,
  buttons: Object.fromEntries(
    Object.entries(controllerActions).map(([action, [, button]]) => [action, button]),
  ),
};
export const controllerRanges = {
  sensitivity: [0.25, 3, 0.05],
  horizontal: [0.25, 3, 0.05],
  vertical: [0.25, 3, 0.05],
  leftDeadzone: [0.05, 0.5, 0.01],
  rightDeadzone: [0.05, 0.5, 0.01],
};
const storageKey = "infectionController";

export function defaultControllerSettings() {
  return { ...defaults, buttons: { ...defaults.buttons } };
}

export function loadControllerSettings(storage) {
  const settings = defaultControllerSettings();
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(storageKey));
    for (const [name, [min, max]] of Object.entries(controllerRanges)) {
      const value = saved?.[name];
      if (Number.isFinite(value)) settings[name] = Math.min(max, Math.max(min, value));
    }
    for (const name of ["invertY", "vibration"]) {
      if (typeof saved?.[name] === "boolean") settings[name] = saved[name];
    }
    const buttons = { ...defaults.buttons };
    for (const action of Object.keys(buttons)) {
      const value = saved?.buttons?.[action];
      if (Number.isInteger(value) && value >= 0 && value <= 31 && value !== 1)
        buttons[action] = value;
    }
    if (new Set(Object.values(buttons)).size === Object.keys(buttons).length)
      settings.buttons = buttons;
  } catch {
    // Fresh or unavailable storage uses defaults.
  }
  return settings;
}

export function saveControllerSettings(settings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

export function controllerType(id) {
  if (/playstation|dualshock|dualsense|wireless controller.*054c|054c|sony/i.test(id))
    return "playstation";
  if (/xbox|xinput|microsoft|045e/i.test(id)) return "xbox";
  return "standard";
}

export function buttonLabel(index, type = "standard") {
  const common = { 10: "L Stick Click", 11: "R Stick Click", 12: "D-Pad Up",
    13: "D-Pad Down", 14: "D-Pad Left", 15: "D-Pad Right" };
  const labels = {
    xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu"],
    playstation: ["X", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share/Create", "Options"],
    standard: ["Bottom Face Button", "Right Face Button", "Left Face Button",
      "Top Face Button", "Left Bumper", "Right Bumper", "Left Trigger",
      "Right Trigger", "Select", "Start"],
  };
  return labels[type]?.[index] || common[index] || "Button " + (index + 1);
}

export function readStick(axes, offset, deadzone) {
  const x = axes[offset] || 0;
  const y = axes[offset + 1] || 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scale = (Math.min(magnitude, 1) - deadzone) / (1 - deadzone) / magnitude;
  return { x: x * scale, y: y * scale };
}

export function createGamepadInput() {
  let active = null;
  let previous = new Set();
  let waitForNeutral = false;
  function poll(settings) {
    let pads = [];
    try {
      pads = Array.from(navigator.getGamepads?.() || []).filter(
        (pad) => pad?.connected && pad.mapping === "standard",
      );
    } catch {
      // Some browsers restrict the API outside focused, secure pages.
    }
    const pad = pads.find((item) => item.index === active?.index) ||
      pads.find((item) => item.buttons.some((button) => button.pressed)) || pads[0] || null;
    const changed = pad?.index !== active?.index || pad?.id !== active?.id;
    if (changed) previous = new Set();
    active = pad;
    if (!pad) return { pad, changed };
    const down = new Set();
    for (const [index, button] of pad.buttons.entries()) {
      if (button.pressed || button.value >= 0.5) down.add(index);
    }
    const left = readStick(pad.axes, 0, settings.leftDeadzone);
    const right = readStick(pad.axes, 2, settings.rightDeadzone);
    const moving = !!(left.x || left.y || right.x || right.y);
    const pressed = [...down].filter((index) => !previous.has(index));
    previous = down;
    if (document.hidden || !document.hasFocus()) waitForNeutral = true;
    if (waitForNeutral) {
      if (!down.size && !moving && !document.hidden && document.hasFocus()) waitForNeutral = false;
      return { pad, changed };
    }
    return { pad, changed, down, pressed, left, right, moving };
  }
  function rumble(settings) {
    if (!settings.vibration) return;
    try {
      const actuator = active?.vibrationActuator || active?.hapticActuators?.[0];
      const effect = actuator?.playEffect
        ? actuator.playEffect("dual-rumble", { duration: 90, strongMagnitude: 0.3, weakMagnitude: 0.5 })
        : actuator?.pulse?.(0.4, 90);
      effect?.catch(() => {});
    } catch {
      // A browser or device can expose haptics without supporting this effect.
    }
  }
  return { poll, rumble, suspend: () => { waitForNeutral = true; } };
}
