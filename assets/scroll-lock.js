const DATASET_KEY = "scrollLocks";
const SCROLL_POSITION_KEY = "scrollLockPosition";

const hasDocument = typeof document !== "undefined";

const getLocks = () => {
  if (!hasDocument || !document.body) return new Set();
  const raw = document.body.dataset[DATASET_KEY];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((lock) => lock.trim())
      .filter(Boolean),
  );
};

const persistLocks = (locks) => {
  if (!hasDocument || !document.body) return;
  if (!locks || locks.size === 0) {
    delete document.body.dataset[DATASET_KEY];
    return;
  }
  document.body.dataset[DATASET_KEY] = Array.from(locks).join(",");
};

export const lockScroll = (lockId = "default") => {
  if (!hasDocument || !document.body || !lockId) return;

  const activeLocks = getLocks();
  if (activeLocks.has(lockId)) {
    return;
  }

  if (activeLocks.size === 0) {
    const currentScrollY = window.scrollY || 0;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.dataset[SCROLL_POSITION_KEY] = String(currentScrollY);
    document.documentElement.style.setProperty("--preserved-scroll-y", `-${currentScrollY}px`);
    document.documentElement.style.setProperty("--scrollbar-width", `${scrollbarWidth}px`);
    document.body.classList.add("modal-position-lock");
  }

  activeLocks.add(lockId);
  persistLocks(activeLocks);
};

export const unlockScroll = (lockId = "default") => {
  if (!hasDocument || !document.body || !lockId) return;

  const activeLocks = getLocks();
  if (!activeLocks.has(lockId)) {
    return;
  }

  activeLocks.delete(lockId);

  if (activeLocks.size > 0) {
    persistLocks(activeLocks);
    return;
  }

  const preservedScroll = document.body.dataset[SCROLL_POSITION_KEY];
  const numericScroll = preservedScroll ? parseInt(preservedScroll, 10) || 0 : 0;

  const html = document.documentElement;

  document.body.classList.remove("modal-position-lock");
  if (html) {
    html.style.removeProperty("--preserved-scroll-y");
    html.style.removeProperty("--scrollbar-width");
  }

  persistLocks(activeLocks);
  delete document.body.dataset[SCROLL_POSITION_KEY];

  let previousScrollBehavior;

  if (html) {
    previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
  }

  window.scrollTo({ top: numericScroll, behavior: "auto" });

  if (html) {
    const restoreScrollBehavior = () => {
      if (previousScrollBehavior) {
        html.style.scrollBehavior = previousScrollBehavior;
        return;
      }
      html.style.removeProperty("scroll-behavior");
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreScrollBehavior);
    } else {
      setTimeout(restoreScrollBehavior, 0);
    }
  }
};
