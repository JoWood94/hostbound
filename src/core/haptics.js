// Vibration feedback.
// Android: navigator.vibrate. iOS Safari has no Vibration API, but since iOS 18
// toggling a native <input type="checkbox" switch> plays the system haptic tick,
// so on iOS we click a hidden switch instead (one tick per call; patterns are
// approximated by their number of pulses). Works only inside a user gesture,
// which is true for lane changes, jumps and taps.
let enabled = true;

export function setHaptics(on) { enabled = on; }

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
let label = null;
function iosTick() {
  if (!label) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'haptic-switch';
    label = document.createElement('label');
    label.htmlFor = input.id;
    label.style.cssText = input.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(input, label);
  }
  label.click();
}

export function buzz(pattern) {
  if (!enabled) return;
  if (canVibrate) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
    return;
  }
  const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
  iosTick();
  for (let i = 1; i < Math.min(pulses, 3); i++) setTimeout(iosTick, i * 70);
}
