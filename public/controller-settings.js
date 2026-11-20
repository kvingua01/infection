import {
  buttonLabel, controllerActions, controllerRanges, defaultControllerSettings,
  loadControllerSettings, saveControllerSettings,
} from "./gamepad.js";

const $ = (id) => document.getElementById(id);
const names = {
  sensitivity: "Controller Sensitivity",
  horizontal: "Horizontal Camera Sensitivity",
  vertical: "Vertical Camera Sensitivity",
  invertY: "Invert Y-Axis",
  leftDeadzone: "Left Stick Deadzone",
  rightDeadzone: "Right Stick Deadzone",
  vibration: "Controller Vibration",
};

export function createControllerSettings() {
  let saved = loadControllerSettings();
  let draft = structuredClone(saved);
  let type = "standard";
  let capture = null;
  let conflict = null;
  const fields = {};
  const bindings = {};
  const status = $("controllerSettingsStatus");

  for (const [key, text] of Object.entries(names)) {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = text;
    const field = document.createElement("input");
    const range = controllerRanges[key];
    const output = document.createElement("output");
    field.type = range ? "range" : "checkbox";
    if (range) [field.min, field.max, field.step] = range;
    field.oninput = () => {
      draft[key] = range ? field.valueAsNumber : field.checked;
      output.textContent = range ? field.value : "";
    };
    label.append(name, field, output);
    $("controllerOptions").append(label);
    fields[key] = { field, output };
  }

  for (const [action, [text]] of Object.entries(controllerActions)) {
    const row = document.createElement("div");
    row.className = "binding-row";
    const name = document.createElement("span");
    name.textContent = text;
    const button = document.createElement("button");
    button.type = "button";
    button.onclick = () => {
      if ($("controllerConnection").dataset.connected !== "true") {
        status.textContent = "Connect a controller and press any button to begin.";
        return;
      }
      capture = action;
      conflict = null;
      render("Press a controller button... Use " + buttonLabel(1, type) + " to cancel.");
    };
    bindings[action] = button;
    row.append(name, button);
    $("controllerBindings").append(row);
  }

  function render(message = "") {
    for (const [key, { field, output }] of Object.entries(fields)) {
      if (field.type === "range") output.textContent = field.value = draft[key];
      else field.checked = draft[key];
    }
    for (const [action, button] of Object.entries(bindings)) {
      button.textContent = capture === action
        ? "Press a controller button..."
        : buttonLabel(draft.buttons[action], type);
      button.setAttribute("aria-label", controllerActions[action][0] + " · " + button.textContent);
      button.classList.toggle("capturing", capture === action || conflict?.action === action);
    }
    $("controllerBindingConflict").hidden = !conflict;
    status.textContent = message;
  }

  function cancel() {
    const action = capture || conflict?.action;
    if (!action) return false;
    capture = null;
    conflict = null;
    render();
    bindings[action].focus();
    return true;
  }

  function captureButtons(pressed) {
    if (!capture) return false;
    const index = pressed.find((button) => button <= 31);
    if (index === undefined) return true;
    if (index === 1) return cancel();
    const action = capture;
    capture = null;
    const other = Object.keys(bindings).find(
      (key) => key !== action && draft.buttons[key] === index,
    );
    if (other) {
      conflict = { action, other };
      render(buttonLabel(index, type) + " is already assigned to " + controllerActions[other][0] + ".");
      $("swapControllerBinding").focus();
    } else {
      draft.buttons[action] = index;
      render();
      bindings[action].focus();
    }
    return true;
  }

  $("cancelControllerBinding").onclick = cancel;
  $("swapControllerBinding").onclick = () => {
    const { action, other } = conflict;
    [draft.buttons[action], draft.buttons[other]] = [draft.buttons[other], draft.buttons[action]];
    cancel();
  };
  $("customizeController").onclick = () => {
    const list = $("controllerBindings");
    list.hidden = !list.hidden;
    $("customizeController").setAttribute("aria-expanded", String(!list.hidden));
    if (list.hidden) cancel();
  };
  $("resetController").onclick = () => {
    draft = defaultControllerSettings();
    capture = null;
    conflict = null;
    render("Controller defaults restored. Save Settings to apply them.");
  };

  return {
    open() {
      draft = structuredClone(saved);
      capture = null;
      conflict = null;
      render();
    },
    save() {
      if (capture || conflict) {
        status.textContent = "Finish or cancel the binding change before saving.";
        return null;
      }
      saved = structuredClone(draft);
      try {
        saveControllerSettings(saved);
        return true;
      } catch {
        return false;
      }
    },
    connected(pad, padType) {
      type = padType;
      const connection = $("controllerConnection");
      connection.dataset.connected = String(!!pad);
      connection.textContent = pad ? "Controller Connected" : "Controller Disconnected";
      $("controllerName").textContent = pad?.id || (pad ? "Standard Gamepad" : "");
      $("controllerHaptics").textContent = pad &&
        !(pad.vibrationActuator || pad.hapticActuators?.length)
        ? "Vibration is unavailable on this device or browser." : "";
      if (!pad) cancel();
      render(status.textContent);
    },
    cancel, captureButtons,
    values: () => saved,
  };
}
