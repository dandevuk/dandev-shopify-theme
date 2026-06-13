export class VideoControls {
  constructor() {
    this.selectors = {
      container: "[js-video-controls]",
      video: "video",
    };

    this.init();
  }

  init() {
    this.initVideoClasses();
    this.handleIntersectionAutoplay();

    document.body.addEventListener("click", this.handleEvent.bind(this));
  }

  handleEvent(e) {
    this.handlePausePlay(e);
  }

  handleIntersectionAutoplay() {
    let options = {
      root: null,
      rootMargin: "100px",
      threshold: 0.5,
    };

    const videoContainers = document.querySelectorAll(this.selectors.container);
    videoContainers.forEach((container) => {
      const video = container.querySelector(this.selectors.video);

      let callback = (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            video.pause();
            container.classList.remove("video-playing");
          } else if (entry.isIntersecting) {
            // Load video source if it hasn't been loaded yet
            this.loadVideoSource(video).then(() => {
              // Only auto-play if autoplay is enabled and not manually paused
              const shouldAutoplay =
                video.getAttribute("autoplay") === "true" ||
                video.getAttribute("autoplay") === "autoplay";

              if (shouldAutoplay && !container.classList.contains("video-manual-pause")) {
                video.play().catch((e) => {
                  console.warn("VideoControls: autoplay was prevented", e);
                });
                container.classList.remove("video-paused");
                container.classList.add("video-playing");
              }
            });
          }
        });
      };

      // Always observe videos for lazy loading, but only autoplay if autoplay is enabled
      let observer = new IntersectionObserver(callback, options);
      if (container && video) observer.observe(container);
    });
  }

  loadVideoSource(video) {
    return new Promise((resolve) => {
      // Check if video sources need to be loaded from data-src
      const sources = video.querySelectorAll("source[data-src]");
      let sourcesLoaded = false;

      sources.forEach((source) => {
        if (source.hasAttribute("data-src")) {
          source.src = source.getAttribute("data-src");
          source.removeAttribute("data-src");
          sourcesLoaded = true;
        }
      });

      // Reload the video element to use the new sources
      if (sourcesLoaded) {
        video.load();

        // Wait for video to be ready to play
        const handleCanPlay = () => {
          video.removeEventListener("canplay", handleCanPlay);
          resolve();
        };

        video.addEventListener("canplay", handleCanPlay);

        // Fallback timeout in case canplay doesn't fire
        setTimeout(() => {
          video.removeEventListener("canplay", handleCanPlay);
          resolve();
        }, 3000);
      } else {
        // No sources to load, resolve immediately
        resolve();
      }
    });
  }

  initVideoClasses() {
    const videoContainers = document.querySelectorAll(this.selectors.container);

    videoContainers.forEach((container) => {
      const video = container.querySelector(this.selectors.video);

      if (video) {
        if (video.paused) {
          container.classList.add("video-paused");
          container.classList.remove("video-playing");
        } else {
          container.classList.add("video-playing");
          container.classList.remove("video-paused");
        }
      }
    });
  }

  handlePausePlay(e) {
    const target = e.target;

    if (target.closest(this.selectors.container)) {
      const container = target.closest(this.selectors.container);

      if (
        container.dataset.customControls !== "true" &&
        container.dataset.customControls !== "auto"
      ) {
        return;
      }

      const video = container.querySelector(this.selectors.video);

      if (video) {
        if (video.paused) {
          this.loadVideoSource(video).then(() => {
            video.play().catch((e) => {
              console.warn("VideoControls: play was prevented", e);
            });
            container.classList.add("video-playing");
            container.classList.remove("video-paused", "video-manual-pause");
          });
        } else {
          video.pause();
          container.classList.add("video-paused", "video-manual-pause");
          container.classList.remove("video-playing");
        }
      }
    }
  }
}

export const videoControls = new VideoControls();
window.VideoControls = videoControls;
