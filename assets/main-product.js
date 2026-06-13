import { productGallerySliderController } from "@theme/product-gallery-slider";
import { bootstrapLightbox } from "@theme/lightbox";
import { morph } from "@theme/morph";
import { VariantUpdateEvent } from "@theme/events";

const PREFETCH_CACHE_MAX = 24;
const LOADING_DELAY_MS = 1000;
const QUICK_ADD_RENDER_SECTION_ID = "section-rendering-product-card-quick-add";
const FEATURED_PRODUCT_RENDER_SECTION_ID = "section-rendering-featured-product";

/** @type {Map<string, Promise<string | null>>} */
const sectionResponseCache = new Map();

/** @type {WeakMap<Element, AbortController>} */
const productSectionFetchControllers = new WeakMap();

/**
 * Aborts any in-flight section fetch for this product so variant and selling-plan
 * pickers cannot apply stale responses out of order.
 *
 * @param {Element | null | undefined} productElement
 * @returns {AbortController}
 */
function beginProductSectionFetch(productElement) {
  productSectionFetchControllers.get(productElement)?.abort();
  const controller = new AbortController();
  if (productElement) {
    productSectionFetchControllers.set(productElement, controller);
  }
  return controller;
}

/**
 * @param {Element | null | undefined} productElement
 * @param {AbortController | null | undefined} controller
 */
function endProductSectionFetch(productElement, controller) {
  if (productElement && productSectionFetchControllers.get(productElement) === controller) {
    productSectionFetchControllers.delete(productElement);
  }
}

function toAbsoluteUrl(url) {
  return new URL(url, window.location.href).href;
}

function getSelectedOptionValueIds(picker, pendingInput = null) {
  return Array.from(picker.querySelectorAll("fieldset.variant-selector"))
    .map((fieldset) => {
      const input =
        pendingInput && fieldset.contains(pendingInput)
          ? pendingInput
          : fieldset.querySelector('input[type="radio"]:checked');
      return input?.dataset.optionValueId;
    })
    .filter(Boolean);
}

function getSectionIdForFetch(productElement) {
  if (productElement?.hasAttribute("data-quick-add-card")) {
    return QUICK_ADD_RENDER_SECTION_ID;
  }
  if (isFeaturedProduct(productElement)) {
    return FEATURED_PRODUCT_RENDER_SECTION_ID;
  }
  return productElement?.dataset.sectionId ?? "";
}

function isQuickAddCard(productElement) {
  return productElement?.hasAttribute("data-quick-add-card") === true;
}

function isFeaturedProduct(productElement) {
  return productElement?.hasAttribute("data-featured-product") === true;
}

function getSectionFetchBaseUrl(productElement, optionInput) {
  return optionInput?.dataset.productUrl || productElement?.dataset.productUrl || "";
}

function getSelectedSellingPlanId(productElement) {
  return productElement?.querySelector('input[name="selling_plan"]')?.value?.trim() || "";
}

function buildSectionUrl(productElement, picker, optionInput) {
  const sectionId = getSectionIdForFetch(productElement);
  const productUrl = getSectionFetchBaseUrl(productElement, optionInput);
  const selectedOptionValues = getSelectedOptionValueIds(picker, optionInput);
  const sellingPlanId = getSelectedSellingPlanId(productElement);

  const url = new URL(productUrl, window.location.href);
  url.searchParams.set("section_id", sectionId);

  if (selectedOptionValues.length > 0) {
    url.searchParams.set("option_values", selectedOptionValues.join(","));
  } else {
    url.searchParams.delete("option_values");
  }

  if (sellingPlanId) {
    url.searchParams.set("selling_plan", sellingPlanId);
  } else {
    url.searchParams.delete("selling_plan");
  }

  return url.href;
}

function getSellingPlanIdFromInput(input) {
  if (!input) {
    return "";
  }

  if (input instanceof HTMLSelectElement) {
    const selectedOption = input.selectedOptions?.[0];
    return selectedOption?.dataset.sellingPlanId ?? input.value ?? "";
  }

  return input.dataset.sellingPlanId ?? input.value ?? "";
}

/**
 * @param {Element | null | undefined} productElement
 * @param {string} sellingPlanId
 */
function focusSellingPlanInput(productElement, sellingPlanId) {
  const picker = productElement?.querySelector("selling-plan-picker");
  if (!picker) {
    return;
  }

  const select = picker.querySelector("select.selling-plan-select");
  if (select instanceof HTMLSelectElement) {
    select.focus();
    return;
  }

  const selector = sellingPlanId
    ? `input[type="radio"][value="${CSS.escape(sellingPlanId)}"]`
    : 'input[type="radio"][value=""]';
  const radio = picker.querySelector(selector);
  if (radio instanceof HTMLElement) {
    radio.focus();
    return;
  }

  picker.querySelector('input[type="radio"]:checked')?.focus();
}

function buildSellingPlanSectionUrl(productElement, sellingPlanInput) {
  const sectionId = getSectionIdForFetch(productElement);
  const productUrl = getSectionFetchBaseUrl(productElement);
  const variantPicker = productElement.querySelector("variant-option-picker");
  const selectedOptionValues = variantPicker ? getSelectedOptionValueIds(variantPicker) : [];
  const sellingPlanId = getSellingPlanIdFromInput(sellingPlanInput);

  const url = new URL(productUrl, window.location.href);
  url.searchParams.set("section_id", sectionId);

  if (selectedOptionValues.length > 0) {
    url.searchParams.set("option_values", selectedOptionValues.join(","));
  } else {
    url.searchParams.delete("option_values");
  }

  if (sellingPlanId) {
    url.searchParams.set("selling_plan", sellingPlanId);
  } else {
    url.searchParams.delete("selling_plan");
  }

  return url.href;
}

function trimPrefetchCache() {
  while (sectionResponseCache.size > PREFETCH_CACHE_MAX) {
    const oldest = sectionResponseCache.keys().next().value;
    sectionResponseCache.delete(oldest);
  }
}

/**
 * @param {string} url
 * @param {{ priority?: "high" | "low" | "auto"; signal?: AbortSignal }} [options]
 * @returns {Promise<string | null>}
 */
function fetchSectionResponseText(url, { priority = "low", signal } = {}) {
  const init = { credentials: "same-origin", priority };
  if (signal) {
    init.signal = signal;
  }

  return fetch(url, init)
    .then((response) => (response.ok ? response.text() : null))
    .catch((error) => {
      if (error?.name === "AbortError") {
        throw error;
      }
      return null;
    });
}

/**
 * @param {string} url
 * @param {{ priority?: "high" | "low" | "auto" }} [options]
 * @returns {Promise<string | null>}
 */
function prefetchSectionResponse(url, { priority = "low" } = {}) {
  const existing = sectionResponseCache.get(url);
  if (existing) {
    return existing;
  }

  const promise = fetchSectionResponseText(url, { priority });
  sectionResponseCache.set(url, promise);
  trimPrefetchCache();
  return promise;
}

function getSelectedVariantId(productElement) {
  const variantInput = productElement.querySelector('input[name="id"]');
  if (variantInput?.value) {
    return variantInput.value;
  }

  const addToCart = productElement.querySelector("[add-to-cart][data-id]");
  return addToCart?.dataset.id || null;
}

async function getBlazeController() {
  if (window.themeBlazeSliderController) {
    return window.themeBlazeSliderController;
  }

  const { blazeSliderController } = await import("@theme/blaze-slider-controller");
  return blazeSliderController;
}

function teardownProductGallery(productElement, blazeController = window.themeBlazeSliderController) {
  if (!productElement) {
    return;
  }

  window.QF?.productGallery?.destroy?.(productElement);

  productElement.querySelectorAll("[data-blaze-slider]").forEach((slider) => {
    blazeController?.destroy?.(slider);
  });

  productGallerySliderController?.destroy?.(productElement);
}

function applyMainGalleryInitialSlide(productElement) {
  const slider = productElement?.querySelector("[main-gallery-slider]");
  if (!slider) {
    return;
  }

  window.themeBlazeSliderController?.syncToInitialSlide?.(slider);
}

async function syncGalleryToSelectedVariant(productElement, blazeController = null) {
  const controller = blazeController || (await getBlazeController());
  if (!controller || !productElement) {
    return;
  }

  const slider = productElement.querySelector("[main-gallery] [data-blaze-slider]");
  if (!slider) {
    return;
  }

  const variantId = getSelectedVariantId(productElement);
  if (variantId) {
    const slides = productElement.querySelectorAll(".main-slider-slide[data-id]");
    for (const slide of slides) {
      const ids = (slide.dataset.id || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (!ids.includes(variantId)) {
        continue;
      }

      const slideIndex = Number(slide.dataset.index);
      if (Number.isFinite(slideIndex)) {
        controller.syncToSlideIndex?.(slider, slideIndex);
        return;
      }
    }
  }

  controller.syncToSlideIndex?.(slider, Number(slider.dataset.sliderInitial) || 0);
}

function updateVariantHistory(productElement) {
  const productForm = productElement.querySelector('product-form[data-enable-history="true"]');
  if (!productForm || typeof window === "undefined") {
    return;
  }

  const variantId = getSelectedVariantId(productElement);
  if (!variantId) {
    return;
  }

  try {
    const productUrl = productElement.dataset.productUrl;
    const url = productUrl
      ? new URL(productUrl, window.location.origin)
      : new URL(window.location.href);

    url.searchParams.set("variant", variantId);
    url.searchParams.delete("option_values");
    url.searchParams.delete("section_id");

    const sellingPlanId = productElement.querySelector('input[name="selling_plan"]')?.value;
    if (sellingPlanId) {
      url.searchParams.set("selling_plan", sellingPlanId);
    } else {
      url.searchParams.delete("selling_plan");
    }

    window.history.replaceState(window.history.state, document.title, url.toString());
  } catch (error) {
    console.warn("VariantOptionPicker: failed to update history state", error);
  }
}

export async function initMainProductGallery(productElement) {
  if (!productElement) {
    return;
  }

  await reinitializeProductGallery(productElement);
}

export async function refreshMainProductGallery(productElement) {
  if (!productElement) {
    return;
  }

  const blazeController = await getBlazeController();
  if (!blazeController) {
    return;
  }

  productElement.querySelectorAll("[main-gallery] [data-blaze-slider]").forEach((slider) => {
    blazeController.refresh?.(slider);
  });

  await syncGalleryToSelectedVariant(productElement, blazeController);
}

async function reinitializeProductGallery(productElement) {
  const blazeController = await getBlazeController();
  if (!blazeController || !productElement) {
    return;
  }

  const galleryStyle = productElement.querySelector("[gallery-container]")?.dataset.galleryStyle;

  teardownProductGallery(productElement, blazeController);

  if (galleryStyle === "grid") {
    if (window.QF?.productGallery?.init) {
      window.QF.productGallery.init(productElement);
    } else {
      await import("@theme/product-gallery");
      window.QF?.productGallery?.init?.(productElement);
    }

    applyMainGalleryInitialSlide(productElement);
    requestAnimationFrame(() => applyMainGalleryInitialSlide(productElement));
    bootstrapLightbox(productElement);
    return;
  }

  blazeController.init?.(productElement);
  productGallerySliderController?.init?.(productElement);
  await syncGalleryToSelectedVariant(productElement, blazeController);
  bootstrapLightbox(productElement);
}

function parseSectionHtml(responseText) {
  return new DOMParser().parseFromString(responseText, "text/html");
}

/**
 * Resolves the correct main-product node from a section response when multiple
 * exist (PDP + product-card quick-add cards in the same section HTML).
 *
 * @param {ParentNode} doc
 * @param {Element | null} liveProductElement
 * @returns {Element | null}
 */
function findMainProductInSection(doc, liveProductElement) {
  const productId = liveProductElement?.dataset?.productId;

  if (isQuickAddCard(liveProductElement)) {
    const quickAddRoot =
      doc.querySelector(`product-card[data-product-id="${CSS.escape(productId)}"] main-product`) ||
      doc.querySelector("product-card-quick-add main-product") ||
      doc.querySelector('main-product[data-quick-add-card="true"]') ||
      doc.querySelector("main-product");
    return quickAddRoot;
  }

  if (!productId) {
    return doc.querySelector("main-product");
  }

  const matches = doc.querySelectorAll(
    `main-product[data-product-id="${CSS.escape(productId)}"]`
  );
  if (!matches.length) {
    return doc.querySelector("main-product");
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const liveInProductCard = liveProductElement?.closest("product-card");
  if (liveInProductCard) {
    const cardMatch = Array.from(matches).find((element) => element.closest("product-card"));
    if (cardMatch) {
      return cardMatch;
    }
  }

  const pdpMatch = Array.from(matches).find((element) => !element.closest("product-card"));
  return pdpMatch ?? matches[0];
}

/**
 * Quick-add cards must not morph PDP radio markup into dropdown UI — replace the whole
 * main-product node from the dedicated rendering section response.
 *
 * @param {HTMLElement} productElement
 * @param {Element} newMainProduct
 * @param {HTMLElement} optionValueElement
 */
function focusOptionInMainProduct(mainProduct, optionValueElement) {
  const optionValueId = optionValueElement?.dataset?.optionValueId;
  if (optionValueId && mainProduct instanceof Element) {
    const matched = mainProduct.querySelector(
      `[data-option-value-id="${CSS.escape(optionValueId)}"]`
    );
    if (matched instanceof HTMLElement) {
      matched.focus();
      return;
    }
  }

  mainProduct?.querySelector("variant-option-picker input:checked")?.focus();
}

function replaceQuickAddMainProduct(productElement, newMainProduct, optionValueElement) {
  const productCard = productElement.closest("product-card");
  const imported = document.importNode(newMainProduct, true);

  productElement.replaceWith(imported);

  const script = imported.querySelector('variant-option-picker script[type="application/json"]');
  let parsedVariant = null;
  if (script?.textContent) {
    try {
      parsedVariant = JSON.parse(script.textContent);
    } catch {
      parsedVariant = null;
    }
  }

  if (productCard && parsedVariant?.id) {
    productCard.dataset.variantId = String(parsedVariant.id);
  }

  focusOptionInMainProduct(imported, optionValueElement);
  return { mainProduct: imported, variant: parsedVariant };
}

function getVariantFromSectionHtml(doc, liveProductElement) {
  const mainProduct = findMainProductInSection(doc, liveProductElement);
  const script = mainProduct?.querySelector(
    'variant-option-picker script[type="application/json"]'
  );
  if (!script?.textContent) {
    return null;
  }

  try {
    return JSON.parse(script.textContent);
  } catch {
    return null;
  }
}

function focusOptionInput(productElement, optionValueElement) {
  if (!(productElement instanceof Element) || !(optionValueElement instanceof Element)) {
    return;
  }

  if (optionValueElement.isConnected && productElement.contains(optionValueElement)) {
    optionValueElement.focus();
    return;
  }

  if (optionValueElement.id) {
    productElement.querySelector(`#${CSS.escape(optionValueElement.id)}`)?.focus();
  }
}

function productUrlPath(url) {
  if (!url) {
    return "";
  }
  return toAbsoluteUrl(url).split("?")[0];
}

function loadsNewProduct(oldProductUrl, optionInput) {
  const newProductUrl = optionInput?.dataset.productUrl;
  if (!newProductUrl || !oldProductUrl) {
    return false;
  }
  return productUrlPath(newProductUrl) !== productUrlPath(oldProductUrl);
}

/**
 * @param {ParentNode | null} root
 * @returns {Element | null}
 */
function getGalleryMount(root) {
  if (!root) {
    return null;
  }
  return (
    root.querySelector(".mobile-slider-overflow") ||
    root.querySelector("[main-gallery]")?.parentElement ||
    null
  );
}

/**
 * Top-level [data-variant-update] targets only (ignores nested markers).
 * @param {ParentNode} root
 * @returns {Element[]}
 */
function getVariantUpdateTargets(root) {
  return Array.from(root.querySelectorAll("[data-variant-update]")).filter(
    (element) => !element.parentElement?.closest("[data-variant-update]")
  );
}

/**
 * Inserts a variant-update region from the section response when it is missing
 * from the live DOM (e.g. selling plans returning after a pre-order variant).
 *
 * @param {ParentNode} root
 * @param {ParentNode} newMain
 * @param {Element} newElement
 * @param {string} key
 */
function insertVariantUpdateRegion(root, newMain, newElement, key) {
  const newTargets = getVariantUpdateTargets(newMain);
  const targetIndex = newTargets.findIndex(
    (element) => element.getAttribute("data-variant-update") === key
  );

  if (targetIndex === -1) {
    return;
  }

  for (let index = targetIndex + 1; index < newTargets.length; index += 1) {
    const nextKey = newTargets[index].getAttribute("data-variant-update");
    if (!nextKey) {
      continue;
    }

    const rootNext = root.querySelector(`[data-variant-update="${CSS.escape(nextKey)}"]`);
    if (rootNext) {
      rootNext.before(document.importNode(newElement, true));
      return;
    }
  }

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const prevKey = newTargets[index].getAttribute("data-variant-update");
    if (!prevKey) {
      continue;
    }

    const rootPrev = root.querySelector(`[data-variant-update="${CSS.escape(prevKey)}"]`);
    if (rootPrev) {
      rootPrev.after(document.importNode(newElement, true));
      return;
    }
  }

  const submitMount = root.querySelector("form.product-submit-container, .product-submit-container");
  if (submitMount?.parentElement) {
    submitMount.parentElement.insertBefore(document.importNode(newElement, true), submitMount);
    return;
  }

  root.appendChild(document.importNode(newElement, true));
}

/**
 * Morphs or replaces regions marked with data-variant-update="unique-key".
 * @param {ParentNode} root
 * @param {ParentNode} doc
 */
function updateVariantRegions(root, doc) {
  const newMain = findMainProductInSection(doc, root);
  if (!newMain) {
    return;
  }

  for (const current of getVariantUpdateTargets(root)) {
    const key = current.getAttribute("data-variant-update");
    if (!key) {
      continue;
    }

    const newElement = newMain.querySelector(`[data-variant-update="${CSS.escape(key)}"]`);
    if (!newElement) {
      current.remove();
      continue;
    }

    if (current.isEqualNode(newElement)) {
      continue;
    }

    const useReplace = current.hasAttribute("data-variant-update-replace");

    if (useReplace) {
      if (current.innerHTML !== newElement.innerHTML) {
        current.replaceWith(document.importNode(newElement, true));
      }
      continue;
    }

    if (current.innerHTML !== newElement.innerHTML) {
      morph(current, newElement, { childrenOnly: true });
    }
  }

  for (const newElement of getVariantUpdateTargets(newMain)) {
    const key = newElement.getAttribute("data-variant-update");
    if (!key) {
      continue;
    }

    if (root.querySelector(`[data-variant-update="${CSS.escape(key)}"]`)) {
      continue;
    }

    insertVariantUpdateRegion(root, newMain, newElement, key);
  }
}

function updateProductPrice(root, doc) {
  const newMain = findMainProductInSection(doc, root);
  const newPrice = newMain?.querySelector(".variant-prices-container");
  const current = root.querySelector(".variant-prices-container");
  if (!newPrice || !current) {
    return;
  }
  if (current.innerHTML !== newPrice.innerHTML) {
    morph(current, newPrice, { childrenOnly: true });
  }
}

function updateProductSubmit(root, doc, variant) {
  const newMain = findMainProductInSection(doc, root);
  const newSubmit = newMain?.querySelector(".product-submit-container");
  const current = root.querySelector(".product-submit-container");
  if (newSubmit && current) {
    morph(current, newSubmit, { childrenOnly: true });
  }

  const idInput = root.querySelector('input[name="id"]');
  if (idInput && variant?.id) {
    idInput.value = String(variant.id);
  }

  const addToCart = root.querySelector("[add-to-cart][data-id]");
  if (addToCart && variant?.id) {
    addToCart.dataset.id = String(variant.id);
  }
}

async function updateProductGallery(root, doc) {
  const newMain = findMainProductInSection(doc, root);
  const currentMount = getGalleryMount(root);
  const newMount = getGalleryMount(newMain);
  if (!currentMount || !newMount) {
    return;
  }

  teardownProductGallery(root);
  currentMount.replaceWith(document.importNode(newMount, true));
  await reinitializeProductGallery(root);
  await refreshMainProductGallery(root);
}

async function applyMainProductHtmlFallback(
  productElement,
  html,
  newProductElement,
  optionValueElement,
  oldProductUrl,
  newProductUrl
) {
  if (newProductUrl && oldProductUrl !== newProductUrl) {
    productElement.dataset.productUrl = newProductElement.dataset.productUrl || newProductUrl;
  }

  teardownProductGallery(productElement);
  productElement.innerHTML = newProductElement.innerHTML;
  await reinitializeProductGallery(productElement);

  focusOptionInput(productElement, optionValueElement);
  updateVariantHistory(productElement);
}

async function applyVariantSectionUpdate(
  picker,
  responseText,
  optionValueElement,
  oldProductUrl
) {
  const html = parseSectionHtml(responseText);
  const productElement = picker.closest("main-product");
  if (!productElement) {
    return;
  }

  const newProductElement = findMainProductInSection(html, productElement);

  if (!newProductElement) {
    return;
  }

  if (loadsNewProduct(oldProductUrl, optionValueElement)) {
    await applyMainProductHtmlFallback(
      productElement,
      html,
      newProductElement,
      optionValueElement,
      oldProductUrl,
      optionValueElement.dataset.productUrl
    );
    return;
  }

  if (isQuickAddCard(productElement)) {
    const { mainProduct: updatedMain, variant } = replaceQuickAddMainProduct(
      productElement,
      newProductElement,
      optionValueElement
    );
    const newPicker = updatedMain.querySelector("variant-option-picker");
    const sourceId = optionValueElement.dataset.optionValueId ?? "";
    newPicker?.dispatchEvent(
      new VariantUpdateEvent(variant, sourceId, {
        html,
        productId: updatedMain.dataset.productId ?? "",
        sectionId: getSectionIdForFetch(updatedMain),
      })
    );
    return;
  }

  const newPicker = newProductElement.querySelector("variant-option-picker");
  if (newPicker) {
    morph(picker, newPicker);
  }

  const variant = getVariantFromSectionHtml(html, productElement);
  const sourceId = optionValueElement.dataset.optionValueId ?? "";

  updateProductPrice(productElement, html);
  updateProductSubmit(productElement, html, variant);
  updateVariantRegions(productElement, html);
  await updateProductGallery(productElement, html);

  picker.dispatchEvent(
    new VariantUpdateEvent(variant, sourceId, {
      html,
      productId: picker.dataset.productId ?? productElement.dataset.productId ?? "",
      sectionId: productElement.dataset.sectionId ?? "",
    })
  );

  focusOptionInput(productElement, optionValueElement);
  updateVariantHistory(productElement);
}

async function applySellingPlanSectionUpdate(picker, responseText, planInput) {
  const html = parseSectionHtml(responseText);
  const productElement = picker.closest("main-product");
  if (!productElement) {
    return;
  }

  const sellingPlanId = getSellingPlanIdFromInput(planInput);
  const newProductElement = findMainProductInSection(html, productElement);

  if (!newProductElement) {
    return;
  }

  const variant = getVariantFromSectionHtml(html, productElement);

  updateProductPrice(productElement, html);
  updateProductSubmit(productElement, html, variant);
  updateVariantRegions(productElement, html);

  focusSellingPlanInput(productElement, sellingPlanId);

  updateVariantHistory(productElement);
}

export class VariantOptionPicker extends HTMLElement {
  #abortController = null;
  #pendingLoads = 0;
  #loadingDelayTimer = null;
  #loadingShown = false;

  connectedCallback() {
    this.addEventListener("change", this.#onVariantChange);
    this.addEventListener("click", this.#onOptionClick, true);
    this.addEventListener("pointerenter", this.#onOptionPrefetch, true);
    this.addEventListener("focusin", this.#onOptionPrefetch, true);
    this.addEventListener("pointerdown", this.#onOptionPointerdown, true);
    this.addEventListener("touchstart", this.#onOptionTouchstart, {
      capture: true,
      passive: true,
    });
  }

  disconnectedCallback() {
    const productElement = this.closest("main-product");
    if (productElement && productSectionFetchControllers.get(productElement) === this.#abortController) {
      this.#abortController?.abort();
      productSectionFetchControllers.delete(productElement);
    }
    this.#clearLoadingDelayTimer();
    this.removeEventListener("change", this.#onVariantChange);
    this.removeEventListener("click", this.#onOptionClick, true);
    this.removeEventListener("pointerenter", this.#onOptionPrefetch, true);
    this.removeEventListener("focusin", this.#onOptionPrefetch, true);
    this.removeEventListener("pointerdown", this.#onOptionPointerdown, true);
    this.removeEventListener("touchstart", this.#onOptionTouchstart, true);
  }

  #getOptionInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "radio") {
      return null;
    }
    return target;
  }

  #isUnavailableOptionInput(input) {
    return (
      input.getAttribute("data-option-exists") === "false" ||
      input.closest(".unavailable-combination") != null
    );
  }

  #setPickerLoading(isLoading) {
    this.classList.toggle("is-updating", isLoading);
    this.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  #clearLoadingDelayTimer() {
    if (this.#loadingDelayTimer != null) {
      window.clearTimeout(this.#loadingDelayTimer);
      this.#loadingDelayTimer = null;
    }
  }

  #schedulePickerLoading() {
    this.#clearLoadingDelayTimer();
    if (this.#loadingShown) {
      return;
    }

    this.#loadingDelayTimer = window.setTimeout(() => {
      this.#loadingDelayTimer = null;
      if (this.#pendingLoads > 0) {
        this.#setPickerLoading(true);
        this.#loadingShown = true;
      }
    }, LOADING_DELAY_MS);
  }

  #endPickerLoading() {
    this.#clearLoadingDelayTimer();
    if (this.#loadingShown) {
      this.#setPickerLoading(false);
      this.#loadingShown = false;
    }
  }

  #prefetchForOption(optionInput, { priority = "low" } = {}) {
    const productElement = this.closest("main-product");
    if (!productElement) {
      return;
    }

    prefetchSectionResponse(buildSectionUrl(productElement, this, optionInput), { priority });
  }

  #prefetchFromEvent(event, { priority = "low" } = {}) {
    const optionInput = this.#resolveOptionInput(event);
    if (!optionInput || this.#isUnavailableOptionInput(optionInput)) {
      return;
    }

    this.#prefetchForOption(optionInput, { priority });
  }

  #onOptionPrefetch = (event) => {
    this.#prefetchFromEvent(event, { priority: "low" });
  };

  #onOptionPointerdown = (event) => {
    this.#prefetchFromEvent(event, { priority: "high" });
  };

  #onOptionTouchstart = (event) => {
    this.#prefetchFromEvent(event, { priority: "high" });
  };

  #resolveOptionInput(event) {
    const directInput = this.#getOptionInput(event);
    if (directInput) {
      return directInput;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }

    const wrapper = target.closest(".variant-wrapper");
    if (wrapper) {
      const wrapperInput = wrapper.querySelector('input[type="radio"]');
      if (wrapperInput instanceof HTMLInputElement) {
        return wrapperInput;
      }
    }

    const label = target.closest("label[for]");
    if (!(label instanceof HTMLLabelElement)) {
      return null;
    }

    const linkedInput = document.getElementById(label.htmlFor);
    return linkedInput instanceof HTMLInputElement && linkedInput.type === "radio"
      ? linkedInput
      : null;
  }

  #onOptionClick = (event) => {
    const optionInput = this.#resolveOptionInput(event);
    if (!optionInput || !this.#isUnavailableOptionInput(optionInput)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  #onVariantChange = async (event) => {
    const optionValueElement = this.#resolveOptionInput(event);
    if (!optionValueElement || this.#isUnavailableOptionInput(optionValueElement)) {
      return;
    }

    const productElement = this.closest("main-product");
    if (!productElement) {
      return;
    }

    const oldProductUrl = productElement.dataset.productUrl;
    const url = buildSectionUrl(productElement, this, optionValueElement);

    const fetchController = beginProductSectionFetch(productElement);
    this.#abortController = fetchController;
    const { signal } = fetchController;

    this.#pendingLoads += 1;
    this.#schedulePickerLoading();

    try {
      const cachedResponse = sectionResponseCache.get(url);
      let responseText = cachedResponse ? await cachedResponse : null;

      if (!responseText) {
        try {
          responseText = await fetchSectionResponseText(url, { priority: "high", signal });
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }
          throw error;
        }
        if (responseText) {
          sectionResponseCache.set(url, Promise.resolve(responseText));
        }
      }

      if (signal.aborted || !responseText) {
        return;
      }

      await applyVariantSectionUpdate(this, responseText, optionValueElement, oldProductUrl);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("VariantOptionPicker: failed to update product", error);
      }
    } finally {
      endProductSectionFetch(productElement, fetchController);
      this.#pendingLoads -= 1;
      if (this.#pendingLoads <= 0) {
        this.#pendingLoads = 0;
        this.#endPickerLoading();
      }
    }
  };
}

customElements.define("variant-option-picker", VariantOptionPicker);

export class SellingPlanPicker extends HTMLElement {
  #abortController = null;
  #pendingLoads = 0;
  #loadingDelayTimer = null;
  #loadingShown = false;

  connectedCallback() {
    this.addEventListener("change", this.#onSellingPlanChange);
  }

  disconnectedCallback() {
    const productElement = this.closest("main-product");
    if (productElement && productSectionFetchControllers.get(productElement) === this.#abortController) {
      this.#abortController?.abort();
      productSectionFetchControllers.delete(productElement);
    }
    this.#clearLoadingDelayTimer();
    this.removeEventListener("change", this.#onSellingPlanChange);
  }

  #getPlanInput(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "radio") {
      return target;
    }
    if (target instanceof HTMLSelectElement) {
      return target;
    }
    return null;
  }

  #setPickerLoading(isLoading) {
    this.classList.toggle("is-updating", isLoading);
    this.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  #clearLoadingDelayTimer() {
    if (this.#loadingDelayTimer != null) {
      window.clearTimeout(this.#loadingDelayTimer);
      this.#loadingDelayTimer = null;
    }
  }

  #schedulePickerLoading() {
    this.#clearLoadingDelayTimer();
    if (this.#loadingShown) {
      return;
    }

    this.#loadingDelayTimer = window.setTimeout(() => {
      this.#loadingDelayTimer = null;
      if (this.#pendingLoads > 0) {
        this.#setPickerLoading(true);
        this.#loadingShown = true;
      }
    }, LOADING_DELAY_MS);
  }

  #endPickerLoading() {
    this.#clearLoadingDelayTimer();
    if (this.#loadingShown) {
      this.#setPickerLoading(false);
      this.#loadingShown = false;
    }
  }

  #onSellingPlanChange = async (event) => {
    const planInput = this.#getPlanInput(event);
    if (!planInput) {
      return;
    }

    const productElement = this.closest("main-product");
    if (!productElement) {
      return;
    }

    const sellingPlanId = getSellingPlanIdFromInput(planInput);
    const hiddenInput = productElement.querySelector('input[name="selling_plan"]');
    if (hiddenInput) {
      hiddenInput.value = sellingPlanId;
    }

    const url = buildSellingPlanSectionUrl(productElement, planInput);

    const fetchController = beginProductSectionFetch(productElement);
    this.#abortController = fetchController;
    const { signal } = fetchController;

    this.#pendingLoads += 1;
    this.#schedulePickerLoading();

    try {
      const cachedResponse = sectionResponseCache.get(url);
      let responseText = cachedResponse ? await cachedResponse : null;

      if (!responseText) {
        try {
          responseText = await fetchSectionResponseText(url, { priority: "high", signal });
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }
          throw error;
        }
        if (responseText) {
          sectionResponseCache.set(url, Promise.resolve(responseText));
        }
      }

      if (signal.aborted || !responseText) {
        return;
      }

      await applySellingPlanSectionUpdate(this, responseText, planInput);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("SellingPlanPicker: failed to update product", error);
      }
    } finally {
      endProductSectionFetch(productElement, fetchController);
      this.#pendingLoads -= 1;
      if (this.#pendingLoads <= 0) {
        this.#pendingLoads = 0;
        this.#endPickerLoading();
      }
    }
  };
}

customElements.define("selling-plan-picker", SellingPlanPicker);
