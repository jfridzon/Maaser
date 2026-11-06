// Motion that imitates Liquid Glass on the web. Real refraction is only available to native apps,
// so the feel comes from physics: a spring-driven lens that stretches with its speed, follows the
// finger across the tab bar, and a highlight that lights up where the glass is touched.

export class Spring {
  constructor(value, onFrame, { stiffness = 300, damping = 24 } = {}) {
    Object.assign(this, { x: value, target: value, v: 0, stiffness, damping, onFrame, raf: 0, last: 0 });
  }
  to(target) {
    this.target = target;
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.step(t)); }
  }
  jump(value) { this.x = this.target = value; this.v = 0; this.onFrame(value, 0); }
  step(now) {
    const dt = Math.min(0.032, (now - this.last) / 1000);
    this.last = now;
    for (let i = 0; i < 4; i++) {
      const a = -this.stiffness * (this.x - this.target) - this.damping * this.v;
      this.v += a * dt / 4;
      this.x += this.v * dt / 4;
    }
    this.onFrame(this.x, this.v);
    if (Math.abs(this.v) < 2 && Math.abs(this.x - this.target) < 0.3) {
      this.jump(this.target);
      this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame(t => this.step(t));
  }
}

// The moving capsule in the tab bar. Pressing lifts it; dragging carries it; release snaps to a tab.
export function tabLens(bar, lens, count, onPick) {
  let lifted = false, dragging = false, startX = 0, index = 0;
  const width = () => (bar.clientWidth - 8) / count;
  const paint = (x, v) => {
    const stretch = Math.min(0.32, Math.abs(v) / 2600), lift = lifted ? 0.1 : 0;
    lens.style.transform = `translate3d(${x}px,0,0) scale(${1 + stretch + lift},${1 - stretch * 0.55 + lift})`;
  };
  const spring = new Spring(0, paint);
  const xFor = i => i * width();
  const at = e => Math.max(0, Math.min(count - 1, Math.floor((e.clientX - bar.getBoundingClientRect().left - 4) / width())));

  bar.addEventListener('pointerdown', e => {
    lifted = true; dragging = false; startX = e.clientX;
    lens.classList.add('lift');
    bar.setPointerCapture(e.pointerId);
    spring.to(xFor(at(e)));
  });
  bar.addEventListener('pointermove', e => {
    if (!lifted) return;
    if (Math.abs(e.clientX - startX) > 6) dragging = true;
    if (dragging) spring.to(Math.max(0, Math.min((count - 1) * width(), e.clientX - bar.getBoundingClientRect().left - width() / 2)));
  });
  const release = e => {
    if (!lifted) return;
    lifted = false;
    lens.classList.remove('lift');
    const i = at(e);
    spring.to(xFor(i));
    onPick(i);
  };
  bar.addEventListener('pointerup', release);
  bar.addEventListener('pointercancel', () => { lifted = false; lens.classList.remove('lift'); spring.to(xFor(index)); });

  lens.style.width = `${100 / count}%`;
  return {
    set(i, instant) { index = i; if (instant) spring.jump(xFor(i)); else spring.to(xFor(i)); },
    resize() { spring.jump(xFor(index)); },
  };
}

// A soft light that appears under the finger on any glass control.
export function touchLight() {
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest('.gl');
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--px', `${e.clientX - r.left}px`);
    g.style.setProperty('--py', `${e.clientY - r.top}px`);
  }, { passive: true });
}
