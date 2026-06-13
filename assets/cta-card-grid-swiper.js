// Initialize Swiper for CTA card grid sections
(function initCtaCardGridSwipers() {
  const containers = document.querySelectorAll('.cta-card-grid-container[data-section-id]');
  if (!containers.length) return;

  containers.forEach(container => {
    const sectionId = container.dataset.sectionId;
    const swiperContainer = container.querySelector('swiper-container');
    const gridWrapper = container.querySelector('.desktop-grid-wrapper');

    if (!swiperContainer || !gridWrapper) return;

    const handleSwiperState = (shouldEnable) => {
      if (shouldEnable) {
        // Mobile: Show swiper, hide grid content
        gridWrapper.classList.remove('desktop');
        swiperContainer.setAttribute('init', 'true');

        // Remove any desktop grid items
        const desktopSlides = gridWrapper.querySelectorAll('.desktop-slide');
        desktopSlides.forEach(slide => slide.remove());

        if (swiperContainer.swiper && swiperContainer.swiper.destroyed) {
          swiperContainer.initialize();
        } else if (!swiperContainer.swiper && typeof swiperContainer.initialize === 'function') {
          swiperContainer.initialize();
        }
        return;
      }

      // Desktop: Create grid layout
      if (swiperContainer.swiper && !swiperContainer.swiper.destroyed) {
        swiperContainer.swiper.destroy(true, true);
      }

      // Clear any existing desktop grid items first to prevent duplication
      const existingDesktopSlides = gridWrapper.querySelectorAll('.desktop-slide');
      existingDesktopSlides.forEach(slide => slide.remove());

      // Move slide content to grid items
      const slides = swiperContainer.querySelectorAll('swiper-slide');
      slides.forEach(slide => {
        const gridItem = document.createElement('div');
        gridItem.className = `desktop-slide ${slide.className.replace('swiper-slide', '').trim()}`;
        gridItem.innerHTML = slide.innerHTML;
        gridWrapper.appendChild(gridItem);
      });

      gridWrapper.classList.add('desktop');
      swiperContainer.setAttribute('init', 'false');
    };

    const applyInitialState = () => {
      const isMobile = window.innerWidth <= 767;
      handleSwiperState(isMobile);
    };

    // Wait for swiper to be fully initialized before applying state
    if (swiperContainer.swiper) {
      applyInitialState();
    } else {
      // Listen for swiper initialization
      swiperContainer.addEventListener('swiper-init', applyInitialState);
      // Fallback timeout in case event doesn't fire
      setTimeout(applyInitialState, 100);
    }

    let resizeTimeout;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(applyInitialState, 100);
    };

    window.addEventListener('resize', handleResize);
  });
})();