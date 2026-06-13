import { SECTION_HANDLES } from "@theme/cart-constants";

function findTargets(selectorList = []) {
  return selectorList.flatMap((sel) => Array.from(document.querySelectorAll(sel))).filter(Boolean);
}

function parseSectionNodes(html, extractSelector) {
  const template = document.createElement("template");
  template.innerHTML = html;
  let source = template.content;

  if (extractSelector) {
    const extracted = template.content.querySelector(extractSelector);
    if (extracted) {
      const innerTemplate = document.createElement("template");
      innerTemplate.innerHTML = extracted.innerHTML;
      source = innerTemplate.content;
    }
  }

  return Array.from(source.childNodes || []);
}

export function renderSections(cart, sections, reason = "") {
  if (!sections || typeof sections !== "object") return;

  Object.entries(sections).forEach(([handle, html]) => {
    const config = cart?.sectionConfig?.[handle];
    // Do not let section rendering overwrite content inside the recommendations modal
    const targets = (config ? findTargets(config.targets) : []).filter(
      (t) => !t.closest(".cart-recommendations-modal"),
    );

    if (!targets.length) {
      return;
    }

    const nodes = parseSectionNodes(html, config?.extractSelector);

    targets.forEach((target) => {
      const clones = nodes.map((node) => node.cloneNode(true));
      if (typeof target.replaceChildren === "function") {
        target.replaceChildren(...clones);
      } else {
        target.innerHTML = "";
        clones.forEach((clone) => target.appendChild(clone));
      }
    });

    if (handle === SECTION_HANDLES.drawer) {
      if (cart?.state) cart.state.drawerHydrated = true;
    }

    if (handle === SECTION_HANDLES.recommendations && typeof html === "string" && html.trim()) {
      if (typeof cart?.getRecommendationsController === "function") {
        Promise.resolve(cart.getRecommendationsController()).then((ctrl) =>
          ctrl?.initRecommendationsSlider?.(),
        );
      } else {
        cart?.recommendations?.initRecommendationsSlider?.();
      }
    }
  });

  cart?.dispatchEvent?.("cart:sections-rendered", { reason, sections: Object.keys(sections) });
  cart?.dispatchEvent?.("cart_rendered", { sections, reason, cart: cart?.cart });
}
