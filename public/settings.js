const controls = {
  forward: ["Move Forward", "KeyW"],
  backward: ["Move Backward", "KeyS"],
  left: ["Move Left", "KeyA"],
  right: ["Move Right", "KeyD"],
  jump: ["Jump", "Space"],
  throw: ["Throw Projectile", "Mouse0"],
  slot1: ["Select Power-up Slot 1", "Digit1"],
  slot2: ["Select Power-up Slot 2", "Digit2"],
  use: ["Activate Power-up", "KeyF"],
  camera: ["Switch Camera", "KeyV"],
  scores: ["Show Scores", "Tab"],
  settings: ["Open Settings", "Escape"],
};
const defaults = Object.fromEntries(
  Object.entries(controls).map(([action, [, code]]) => [action, code]),
);
const storageKey = "infectionKeybinds";

function validInput(code) {
  return typeof code === "string" && (
    /^Mouse[0-4]$/.test(code) ||
    /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(code) ||
    /^(?:Arrow(?:Up|Down|Left|Right)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma|ParenLeft|ParenRight))$/.test(code) ||
    /^(?:Escape|Space|Tab|Enter|Backspace|CapsLock|ContextMenu|Delete|End|Help|Home|Insert|NumLock|PageDown|PageUp|Pause|PrintScreen|ScrollLock|Backquote|Backslash|BracketLeft|BracketRight|Comma|Equal|Minus|Period|Quote|Semicolon|Slash|IntlBackslash|IntlRo|IntlYen|Convert|NonConvert|Lang[1-5])$/.test(code) ||
    /^(?:AudioVolume(?:Mute|Down|Up)|Media(?:PlayPause|Stop|TrackNext|TrackPrevious)|Browser(?:Back|Favorites|Forward|Home|Refresh|Search|Stop)|Launch(?:App1|App2|Mail|MediaPlayer)|Power|Sleep|WakeUp|Fn|FnLock|Eject)$/.test(code)
  );
}

function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      return { ...defaults };
    const bindings = { ...defaults };
    for (const action of Object.keys(defaults)) {
      if (Object.hasOwn(saved, action)) {
        if (!validInput(saved[action])) return { ...defaults };
        bindings[action] = saved[action];
      }
    }
    if (new Set(Object.values(bindings)).size === Object.keys(defaults).length)
      return bindings;
  } catch {
    // Storage may be unavailable or contain invalid JSON.
  }
  return { ...defaults };
}

export function inputLabel(code) {
  const mouse = ["Left Mouse", "Middle Mouse", "Right Mouse", "Mouse 4", "Mouse 5"];
  if (code.startsWith("Mouse")) return mouse[Number(code.slice(5))] || code;
  return code
    .replace(/^(?:Key|Digit)(?=[A-Z0-9]$)/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function createSettings({ onOpen, onClose, onSave, inGame }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("settings");
  const buttons = {};
  let bindings = loadBindings();
  let draft = null;
  let capturing = null;
  let conflict = null;
  let suppressClick = false;

  function render(message = "") {
    for (const [action, button] of Object.entries(buttons)) {
      button.textContent = capturing === action
        ? "Press any key..."
        : inputLabel(draft[action]);
      button.classList.toggle("capturing", capturing === action || conflict?.action === action);
      button.setAttribute("aria-label", controls[action][0] + " · " + button.textContent);
    }
    $("settingsStatus").textContent = message;
    $("bindingConflict").hidden = !conflict;
    $("saveBindings").disabled = !!(capturing || conflict);
  }

  function cancelCapture() {
    const action = capturing || conflict?.action;
    capturing = null;
    conflict = null;
    render();
    buttons[action]?.focus();
  }

  function assign(code) {
    if (!validInput(code)) return;
    const action = capturing;
    const other = Object.keys(draft).find(
      (name) => name !== action && draft[name] === code,
    );
    capturing = null;
    if (other) {
      conflict = { action, other };
      render(inputLabel(code) + " is already assigned to " + controls[other][0] + ".");
      $("swapBinding").focus();
      return;
    }
    draft[action] = code;
    render();
    buttons[action].focus();
  }

  function open() {
    if (dialog.open) return;
    draft = { ...bindings };
    render();
    $("closeSettings").textContent = inGame() ? "Back to Game" : "Back to Menu";
    dialog.showModal();
    onOpen();
  }

  function close() {
    capturing = null;
    conflict = null;
    dialog.close();
    onClose();
  }

  for (const [action, [label]] of Object.entries(controls)) {
    const row = document.createElement("div");
    row.className = "binding-row";
    const name = document.createElement("span");
    name.textContent = label;
    const button = document.createElement("button");
    button.type = "button";
    button.onclick = () => {
      capturing = action;
      conflict = null;
      render("Press Escape to cancel.");
    };
    buttons[action] = button;
    row.append(name, button);
    $("controlList").append(row);
  }

  $("menuSettings").onclick = $("gameSettings").onclick = open;
  $("closeSettings").onclick = $("cancelSettings").onclick = close;
  $("toggleControls").onclick = () => {
    cancelCapture();
    const list = $("controlList");
    list.hidden = !list.hidden;
    $("toggleControls").setAttribute("aria-expanded", String(!list.hidden));
    $("toggleControls").focus();
  };
  $("cancelBinding").onclick = cancelCapture;
  $("swapBinding").onclick = () => {
    const { action, other } = conflict;
    [draft[action], draft[other]] = [draft[other], draft[action]];
    cancelCapture();
  };
  $("resetBindings").onclick = () => {
    draft = { ...defaults };
    capturing = null;
    conflict = null;
    render("Defaults restored. Save Settings to apply them.");
  };
  $("saveBindings").onclick = () => {
    bindings = { ...draft };
    onSave(bindings);
    try {
      localStorage.setItem(storageKey, JSON.stringify(bindings));
      render("Settings saved.");
    } catch {
      render("Settings applied. This browser could not save them for future visits.");
    }
  };

  dialog.addEventListener("cancel", (event) => event.preventDefault());
  dialog.addEventListener("keydown", (event) => {
    if (!capturing && event.code !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.code === "Escape") {
      if (capturing || conflict) cancelCapture();
      else close();
    } else {
      assign(event.code);
    }
  }, true);
  addEventListener("pointerdown", (event) => {
    suppressClick = !!(dialog.open && capturing);
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    assign("Mouse" + event.button);
  }, true);
  for (const type of ["click", "auxclick"]) {
    addEventListener(type, (event) => {
      if (!suppressClick || !event.detail) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
  dialog.addEventListener("contextmenu", (event) => event.preventDefault());

  return { open, isOpen: () => dialog.open, bindings: () => bindings };
}
