import {
  theDomWatcher,
  handleNewsletterSubscribed,
  trackNewsletterSignup,
  initProductDescriptions,
} from "@theme/helpers";

const featureLoaders = [
  {
    label: "cart",
    selectors: ["[data-cart-drawer]", "[data-cart-container]", "[data-open-cart]"],
    observe: true,
    loader: () => import("@theme/cart"),
  },
  {
    label: "wishlist",
    selectors: ["[wishlist-button]", "[wishlist-grid]", "[side-cart-wishlist-grid]"],
    observe: true,
    loader: () => import("@theme/wishlist"),
  },
  {
    label: "side-cart-tabs",
    selectors: ['.side-cart-tabs[role="tablist"]', "[data-cart-tab]"],
    observe: true,
    loader: () => import("@theme/tabs"),
  },
  {
    label: "toasty",
    selectors: ["body"],
    loader: () => import("@theme/toasty"),
  },
  {
    label: "product-quick-add",
    selectors: ["[quick-add-qf]", "product-form"],
    observe: true,
    loader: () =>
      import("@theme/product-quick-add").then(({ ProductQuickAdd }) => new ProductQuickAdd()),
  },
  {
    label: "quickview",
    selectors: ["product-quick-view", "quickview-modal"],
    loader: () => import("@theme/quickview").then(({ ProductQuickView }) => new ProductQuickView()),
  },
  {
    label: "main-product",
    selectors: ["main-product"],
    observe: true,
    loader: () => import("@theme/main-product"),
  },
  {
    label: "product-gallery-grid",
    selectors: ['[gallery-container][data-gallery-style="grid"]'],
    loader: () => import("@theme/product-gallery"),
  },
  // {
  //   label: "product-form",
  //   selectors: ["product-form"],
  //   observe: true,
  //   loader: () => import("@theme/option-selectors").then(({ ProductForm }) => new ProductForm()),
  // },
  {
    label: "product-card",
    selectors: ["product-card"],
    loader: () => import("@theme/product-card").then(({ ProductCard }) => new ProductCard()),
  },
  {
    label: "custom-option-dropdown",
    selectors: ["custom-option-dropdown"],
    observe: true,
    loader: () => import("@theme/custom-option-dropdown"),
  },
  {
    label: "predictive-search",
    selectors: ["predictive-search"],
    loader: () => import("@theme/search").then(({ SearchController }) => new SearchController()),
  },
  {
    label: "menu",
    selectors: ["#open-mobile-menu", ".mobile-menu-outer-wrapper"],
    loader: () => import("@theme/menu").then(({ MenuController }) => new MenuController()),
  },
  {
    label: "accordion",
    selectors: [".accordion"],
    loader: () =>
      import("@theme/accordion").then(({ AccordionController }) => new AccordionController()),
  },
  {
    label: "product-quantity",
    selectors: ["[quantity-select]"],
    observe: true,
    loader: () =>
      import("@theme/product-quantity").then(({ ProductQuantity }) => new ProductQuantity()),
  },
  {
    label: "header-layout",
    selectors: ["[data-header-layout]"],
    loader: () =>
      import("@theme/header-layout").then(
        ({ HeaderLayoutController }) => new HeaderLayoutController(),
      ),
  },
  {
    label: "header-scroll",
    selectors: [".header-outer-shopify-wrapper"],
    loader: () =>
      import("@theme/header-scroll").then(
        ({ HeaderScrollController }) => new HeaderScrollController(),
      ),
  },
  {
    label: "modal-controller",
    selectors: ["[data-modal-trigger]", "[data-modal]"],
    loader: () =>
      import("@theme/modal-controller").then(({ ModalController }) => {
        if (window.__quickfireModalController) {
          return window.__quickfireModalController;
        }
        const instance = new ModalController();
        window.__quickfireModalController = instance;
        return instance;
      }),
  },
  {
    label: "lightbox",
    selectors: ["[data-lightbox-modal]"],
    observe: true,
    loader: () =>
      import("@theme/lightbox").then(({ bootstrapLightbox }) => bootstrapLightbox()),
  },
];

featureLoaders.forEach(({ selectors, loader, label, observe }) =>
  theDomWatcher(selectors, loader, { label, observe }),
);

theDomWatcher(
  "[data-blaze-slider]",
  () =>
    import("@theme/blaze-slider-controller").then(({ blazeSliderController }) => {
      blazeSliderController.init(document);
      return blazeSliderController;
    }),
  { label: "blaze-slider", observe: true },
);

theDomWatcher("form.newsletter-form", handleNewsletterSubscribed, { label: "newsletter-form" });
theDomWatcher('input[name="contact[email]"]', trackNewsletterSignup, {
  label: "newsletter-signup",
});
theDomWatcher("[read-more-container]", initProductDescriptions, { label: "read-more" });
