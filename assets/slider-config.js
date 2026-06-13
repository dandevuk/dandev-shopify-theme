export const SLIDER_BREAKPOINTS = {
  tablet: 768,
  desktop: 992,
  wide: 1600,
};

export function createBreakpointConfig({
  mobileSlides,
  tabletSlides,
  desktopSlides,
  wideSlides,
  mobileGap,
  tabletGap,
  desktopGap,
  wideGap,
  loop = true,
  enablePagination = false,
  enableAutoplay = false,
  autoplayInterval = 3000,
}) {
  return {
    all: {
      slidesToShow: mobileSlides,
      slideGap: `${mobileGap}px`,
      loop,
      enablePagination,
      enableAutoplay,
      autoplayInterval,
    },
    [`(min-width: ${SLIDER_BREAKPOINTS.tablet}px)`]: {
      slidesToShow: tabletSlides,
      slideGap: `${tabletGap}px`,
      loop,
      enablePagination,
      enableAutoplay,
      autoplayInterval,
    },
    [`(min-width: ${SLIDER_BREAKPOINTS.desktop}px)`]: {
      slidesToShow: desktopSlides,
      slideGap: `${desktopGap}px`,
      loop,
      enablePagination,
      enableAutoplay,
      autoplayInterval,
    },
    [`(min-width: ${SLIDER_BREAKPOINTS.wide}px)`]: {
      slidesToShow: wideSlides,
      slideGap: `${wideGap}px`,
      loop,
      enablePagination,
      enableAutoplay,
      autoplayInterval,
    },
  };
}
