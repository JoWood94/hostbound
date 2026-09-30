// Fixed timestep game loop. Logic runs at exactly STEP seconds; render gets an
// interpolation alpha so motion stays smooth on any refresh rate.
export const STEP = 1 / 60;
const MAX_FRAME = 0.25; // clamp so a tab switch does not spiral

export function startLoop({ update, render }) {
  let last = performance.now();
  let acc = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render(acc / STEP);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    stop() { running = false; },
    resume() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      requestAnimationFrame(frame);
    },
  };
}
