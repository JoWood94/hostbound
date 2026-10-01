// Vibration feedback. Works on Android browsers; iOS gives web pages no access
// to the Taptic Engine (tried the hidden-switch trick: it does not fire).
let enabled = true;

export function setHaptics(on) { enabled = on; }

export function buzz(pattern) {
  if (!enabled || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}
