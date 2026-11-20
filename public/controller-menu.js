const $ = (id) => document.getElementById(id);
const columns = 8;
const textFields = ["nickname", "lobbyName", "privateCode"];

export function createControllerMenu({ settings, controller, back }) {
  const keyboard = $("screenKeyboard");
  const value = $("keyboardValue");
  const keys = $("keyboardKeys");
  let field = null;
  let direction = null;
  let repeatAt = 0;

  function closeKeyboard(save) {
    if (save && field) {
      field.value = value.value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    keyboard.close();
    field?.focus();
    field = null;
  }

  function openKeyboard(input) {
    field = input;
    value.value = field.value;
    value.maxLength = field.maxLength;
    $("keyboardTitle").textContent = field.labels[0].textContent;
    keys.replaceChildren();
    const alphabet = field.id === "privateCode"
      ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" : "abcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const char of alphabet) addKey(char, () => append(char));
    if (field.id !== "privateCode") addKey("Space", () => append(" "));
    addKey("Delete", () => { value.value = value.value.slice(0, -1); });
    keyboard.showModal();
    keys.firstElementChild.focus();
  }

  function append(char) {
    if (value.value.length < value.maxLength) value.value += char;
  }

  function addKey(label, activate) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = activate;
    keys.append(button);
  }

  $("keyboardDone").onclick = () => closeKeyboard(true);
  $("keyboardCancel").onclick = () => closeKeyboard(false);
  keyboard.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeKeyboard(false);
  });

  function root() {
    if (keyboard.open) return keyboard;
    if (settings.isOpen()) return $("settings");
    for (const id of ["join", "waitingRoom", "scores"]) {
      if (!$(id).hidden) return $(id);
    }
    return null;
  }

  function options(scope) {
    return [...scope.querySelectorAll("button, input, summary")].filter(
      (element) => !element.disabled && !element.readOnly && element.getClientRects().length,
    );
  }

  function navigate(scope, current, step, horizontal) {
    const list = options(scope);
    const index = list.indexOf(current);
    if (horizontal && current?.type === "range") {
      if (step > 0) current.stepUp();
      else current.stepDown();
      current.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (scope === keyboard && !horizontal) {
      const keyboardButtons = [...keys.children];
      const keyIndex = keyboardButtons.indexOf(current);
      if (keyIndex >= 0) {
        const target = keyboardButtons[keyIndex + step * columns];
        (target || (step > 0 ? $("keyboardDone") : value)).focus();
      } else if (current === value) {
        (step > 0 ? keys.firstElementChild : $("keyboardDone")).focus();
      } else {
        (step > 0 ? value : keys.lastElementChild).focus();
      }
      return;
    }
    list[(Math.max(index, 0) + step + list.length) % list.length]?.focus();
  }

  function update(sample, now) {
    const scope = root();
    if (!scope) {
      direction = null;
      return false;
    }
    const { down, pressed, left } = sample;
    if (!down) {
      direction = null;
      return true;
    }
    if (scope === $("settings") && controller.captureButtons(pressed)) return true;
    if (scope !== keyboard && scope !== $("settings") &&
        pressed.includes(controller.values().buttons.settings) &&
        controller.values().buttons.settings !== 0) {
      settings.open();
      return true;
    }
    if (pressed.includes(1)) {
      if (scope === keyboard) closeKeyboard(false);
      else if (scope === $("settings")) settings.back();
      else back(scope.id);
      return true;
    }
    const dx = Number(down.has(15)) - Number(down.has(14));
    const dy = Number(down.has(13)) - Number(down.has(12));
    const x = dx || (Math.abs(left.x) > 0.55 ? Math.sign(left.x) : 0);
    const y = dy || (Math.abs(left.y) > 0.55 ? Math.sign(left.y) : 0);
    const next = y ? "y" + y : x ? "x" + x : null;
    if (!next && !pressed.length) {
      direction = null;
      return true;
    }
    const list = options(scope);
    let current = document.activeElement;
    if (!list.includes(current)) {
      current = scope === keyboard ? keys.firstElementChild : list[0];
      current?.focus();
    }
    if (next && (next !== direction || now >= repeatAt)) {
      navigate(scope, current, y || x, !y);
      repeatAt = now + (next === direction ? 120 : 320);
    }
    direction = next;
    if (pressed.includes(0)) {
      current = document.activeElement;
      if (textFields.includes(current?.id)) openKeyboard(current);
      else if (current?.id === value.id) keys.firstElementChild.focus();
      else if (current?.type !== "range" && list.includes(current)) current.click();
    }
    return true;
  }
  return { update };
}
