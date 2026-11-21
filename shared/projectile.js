export const PROJECTILE_SIZE = 0.64;
export const PROJECTILE_COOLDOWN = 2;
export const PROJECTILE_SPEED = 48;

const boxAxes = [["x", "w"], ["y", "h"], ["z", "d"]];

// Sweep the center of the cube against a box expanded by its half-size.
export function projectileHitTime(origin, travel, box, limit = 1) {
  const radius = PROJECTILE_SIZE / 2;
  let enter = 0;
  let exit = limit;
  for (const [axis, size] of boxAxes) {
    const extent = box[size] / 2 + radius;
    const min = box[axis] - extent;
    const max = box[axis] + extent;
    const position = origin[axis];
    const step = travel[axis];
    if (!step) {
      if (position < min || position > max) return Infinity;
      continue;
    }
    const first = (min - position) / step;
    const last = (max - position) / step;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return Infinity;
  }
  return enter;
}
