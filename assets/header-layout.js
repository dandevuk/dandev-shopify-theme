const ROOT = "[data-header-layout]";
const WRAPPER = ".header-wrapper";
const MEASURE_CLASS = "header-layout--measuring";
const TOLERANCE_PX = 2;
const MOBILE_BREAKPOINT_PX = 992;

/**
 * Toggles `mobile` on the header root when the desktop row cannot fit at natural widths.
 * Visibility is handled in CSS; this class only drives layout state.
 */
export class HeaderLayoutController {
  constructor() {
    this.root = document.querySelector(ROOT);
    this.wrapper = this.root?.querySelector(WRAPPER);
    if (!this.root || !this.wrapper) return;

    this._queued = false;
    this._ro = new ResizeObserver(() => this.scheduleUpdate());

    this._ro.observe(this.wrapper);
    window.addEventListener("resize", () => this.scheduleUpdate(), { passive: true });

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.scheduleUpdate());
    }

    this.scheduleUpdate();
  }

  scheduleUpdate() {
    if (this._queued) return;
    this._queued = true;
    requestAnimationFrame(() => {
      this._queued = false;
      this.update();
    });
  }

  setMobileLayout(isMobile) {
    this.root.classList.toggle("mobile", isMobile);
  }

  update() {
    if (!this.root || !this.wrapper) return;

    if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
      this.setMobileLayout(true);
      return;
    }

    this.root.classList.remove("mobile");
    this.wrapper.classList.add(MEASURE_CLASS);

    requestAnimationFrame(() => {
      if (!this.root || !this.wrapper) return;

      let overflows = false;
      try {
        overflows =
          this.wrapper.scrollWidth > this.wrapper.clientWidth + TOLERANCE_PX;
      } finally {
        this.wrapper.classList.remove(MEASURE_CLASS);
      }

      this.setMobileLayout(overflows);
    });
  }
}
