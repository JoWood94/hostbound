// Vibration feedback.
// Android: navigator.vibrate. iOS Safari has no Vibration API, but since iOS 18
// clicking a native <input type="checkbox" switch> plays the system haptic tick.
// WebKit only allows it synchronously inside a touch handler, so the input layer
// calls gestureTick() on every swipe/tap; buzz() from the game loop is a no-op
// on iOS unless a gesture is in progress.
let enabled = true;

export function setHaptics(on) { enabled = on; }

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function iosTick() {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

// Called from pointer/touch handlers: the one place iOS lets us tick.
export function gestureTick() {
  if (!enabled || canVibrate) return;
  try { iosTick(); } catch { /* not iOS */ }
}

export function buzz(pattern) {
  if (!enabled) return;
  if (canVibrate) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
    return;
  }
  try { iosTick(); } catch { /* not iOS */ }
}
