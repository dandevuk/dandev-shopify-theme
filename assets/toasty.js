export class Toasty {
  constructor() {
    this.toasts = [];
    this.init();
  }

  // Methods - - - - - - - - - - - - - - - - - - - - - - - -

  // Initialisation
  init() {
    this.createToastyContainer();
    this.stopScrolling();
    this.setToastPositions();
  }

  // Create Container
  createToastyContainer() {
    if (!document.querySelector("#toasty-zone")) {
      const toasty_container = document.createElement("div");
      toasty_container.id = "toasty-zone";
      document.body.append(toasty_container);
      this.container = toasty_container;
    }
  }

  // Add Toast
  addToast(options) {
    const toast = new Toast({
      ...options,
      toaster: this,
    });
    this.toasts.push(toast);
    this.setToastPositions();
  }

  // Set Toast Positions
  setToastPositions() {
    const gap = 10;
    const toasts = this.container.querySelectorAll("output");
    const header = document.querySelector(".mega-menu");
    const announcement = document.querySelector(".announcement-bar-slider");

    // Get Distance from top of window
    let space = 0;
    if (announcement && window.pageYOffset > announcement.offsetHeight)
      space = window.innerHeight - (window.innerHeight - header.offsetHeight);
    else if (header && announcement)
      space =
        window.innerHeight -
        (window.innerHeight - (header.offsetHeight + announcement.offsetHeight));
    else if (header) space = window.innerHeight - (window.innerHeight - header.offsetHeight);
    this.offset = space + 15;

    toasts.forEach((toast) => {
      if (!toast.classList.contains("dragging")) {
        const rect = toast.getBoundingClientRect();
        toast.style.top = `${this.offset}px`;
        this.offset += rect.height + gap;
      }
    });
  }

  // Check for Scrolling, position toasts
  stopScrolling() {
    let scrollingTimeout;
    window.addEventListener(
      "scroll",
      (e) => {
        window.clearTimeout(scrollingTimeout);
        this.scrolling = true;

        scrollingTimeout = setTimeout(() => {
          this.scrolling = false;
          this.setToastPositions();
        }, 150);
      },
      false,
    );
  }
}

export class Toast {
  constructor(options) {
    this.toaster = options.toaster;
    this.container = this.toaster.container;

    this.id = this.createID();
    this.title = options.title;
    this.message = options.message;
    this.background = options.background;
    this.image = options.image;

    this.delay = options.delay ? options.delay : 50000;
    this.delay_in_seconds = this.delay / 1000;

    this.interacting = false;
    this.node = this.make();
    this.add();

    // Init Additional Features
    this.slideToDismiss();
    this.close();
  }

  // Helper Methods - - - - - - - - - - - - - - - - - - - - - - - -

  // Generates Unique ID
  createID() {
    return `toast-node__${Date.now()}_${Math.floor(Math.random() * 100)}`;
  }

  // Delay - Returns a promise after a given amount of time (ms)
  wait(ms, cancellable = false) {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);

      if (cancellable) {
        const interval = setInterval(() => {
          if (this.interacting) {
            clearTimeout(timeout);
            clearInterval(interval);
          }
        }, 300);
      }
    });
  }

  // Toast Animations Handler
  animateToast(animation) {
    let keyframes, timing;

    switch (animation) {
      case "slide-in":
        // Slide in animation
        keyframes = [
          {
            translate: `calc(150% + var(--drag-offset)) 0 0`,
          },
          {
            translate: `calc(0% + var(--drag-offset)) 0 0`,
          },
        ];

        timing = {
          duration: 300,
          fill: "forwards",
        };
        break;

      case "slide-out":
        // Slide Out animation
        keyframes = [
          {
            translate: `calc(0% + var(--drag-offset)) 0 0`,
          },
          {
            translate: `calc(150% + var(--drag-offset)) 0 0`,
          },
        ];

        timing = {
          duration: 300,
          fill: "forwards",
        };
        break;

      case "slide-loop":
      default:
        // Loop Animation
        keyframes = [
          {
            translate: `calc(0% + var(--drag-offset)) 0 0`,
          },
        ];

        timing = {
          duration: Infinity,
          fill: "forwards",
        };
        break;
    }

    this.node.animate(keyframes, timing);
  }

  // Core Methods - - - - - - - - - - - - - - - - - - - - - - - -

  // Creates Toast Element
  make() {
    // Toast Container
    const node = document.createElement("output");
    node.classList.add("toasty");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.dataset.toastyId = this.id;

    // Set Top Offset
    node.style.top = window.toasty.offset + "px";

    // CSS Properties
    node.style.setProperty("--animation-delay", this.delay_in_seconds + "s");
    node.style.setProperty("--drag-offset", 0 + "px");

    if (this.background) {
      node.classList.add("bg");
      node.style.setProperty("--background", this.background);
    }

    // Icon / Image Element
    if (this.image) {
      node.classList.add("img");
      const img = document.createElement("img");
      img.classList.add("toasty-image");
      img.src = this.image;
      img.alt = this.title;
      node.append(img);
    }

    // Title Element
    if (this.title) {
      const title_node = document.createElement("div");
      title_node.classList.add("toasty-title");
      title_node.innerHTML = this.title;
      node.append(title_node);
    }

    // Body Element
    if (this.message) {
      const body_node = document.createElement("div");
      body_node.classList.add("toasty-body");
      body_node.innerHTML = this.message;
      node.append(body_node);
    }

    // Close Button
    const close_btn = document.createElement("div");
    close_btn.classList.add("toasty-close");
    close_btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M27.542,9.519,25.523,7.5l-8,8-8-8L7.5,9.519l8,8-8,8,2.019,2.019,8-8,8,8,2.019-2.019-8-8Z"
                transform="translate(-7.5 -7.5)" fill="currentColor"></path>
        </svg>`;
    node.append(close_btn);

    return node;
  }

  // Add Toast Element to the DOM
  async add() {
    this.container.append(this.node);
    this.animateToast("slide-in");

    // Check Positions
    window.toasty.setToastPositions();

    // Await Delay + Slide Out
    await this.wait(this.delay + 300, true);
    if (!this.interacting) {
      this.animateToast("slide-out");

      // Await Slide Out + Remove Toast
      await this.wait(300);
      this.node.remove();
      this.removeToastFromArray();

      // Check Positions
      this.toaster.setToastPositions();
    }
  }

  // Reset Delay then remove
  async resetDelay() {
    // Wait for Delay ( again )
    await this.wait(this.delay, true);

    // Check Interaction
    if (!this.interacting) {
      // Play Slide Out Animation
      this.animateToast("slide-out");

      // Await Slide Out + Remove Toast
      await this.wait(300);
      this.node.remove();
      this.removeToastFromArray();

      // Check Positions
      this.toaster.setToastPositions();
    }
  }

  // Remove Toast from Toaster Array
  removeToastFromArray() {
    const idx = this.toaster.toasts.findIndex((t) => t.id === this.id);
    if (idx > -1) this.toaster.toasts.splice(idx, 1);
  }

  close() {
    this.node.querySelector(".toasty-close").addEventListener("click", async () => {
      this.animateToast("slide-out");
      await this.wait(310);
      this.node.remove();
      this.removeToastFromArray();
      this.toaster.setToastPositions();
    });
  }

  // Slide to Dismiss
  slideToDismiss() {
    let isDown = false,
      startPosX = 0,
      lastPosX = 0,
      dragDirection;

    const resetOffset = () => {
      this.node.style.setProperty("--drag-offset", "0px");
      this.node.classList.remove("dragging");
    };

    const handleDown = (x) => {
      isDown = true;
      this.interacting = true;
      startPosX = lastPosX = x;
      this.node.classList.add("dragging");
    };

    const handleMove = (x) => {
      if (!isDown) return;
      this.interacting = true;

      dragDirection = x > lastPosX ? "right" : "left";
      lastPosX = x;

      const dragOffset = (x - startPosX) * 0.5; // resistance
      this.node.style.setProperty("--drag-offset", `${dragOffset}px`);
    };

    const handleUp = async () => {
      if (!isDown) return;
      isDown = false;

      if (dragDirection === "right") {
        this.animateToast("slide-out");
        await this.wait(300);
        this.node.remove();
        this.removeToastFromArray();
      } else {
        resetOffset();
      }

      this.interacting = false;
      this.toaster.setToastPositions();
    };

    this.node.addEventListener("mousedown", (e) => handleDown(e.clientX));
    this.node.addEventListener("touchstart", (e) => handleDown(e.touches[0].clientX));
    this.node.addEventListener("mousemove", (e) => handleMove(e.clientX));
    this.node.addEventListener("touchmove", (e) => handleMove(e.touches[0].clientX));
    this.node.addEventListener("mouseup", handleUp);
    this.node.addEventListener("touchend", handleUp);
  }
}

export const toasty = new Toasty();
window.toasty = toasty;
