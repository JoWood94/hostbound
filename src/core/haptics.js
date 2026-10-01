// Vibration feedback. Works on Android browsers; iOS Safari ignores it silently.
let enabled = true;

export function setHaptics(on) { enabled = on; }

export function buzz(pattern) {
  if (!enabled || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}
