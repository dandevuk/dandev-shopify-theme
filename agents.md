# Quickfire Theme Agent Guide

## Architecture Snapshot

- `layout/theme.liquid` wires fonts, CSS variables, `assets/critical.css`, `assets/utilities.css`, and the JS import map from `snippets/theme-scripts.liquid`. All new assets must be registered here if they need to load globally.
- `sections/` own page-level layout; `snippets/` hold shared markup (e.g. `snippets/slider-navigation.liquid`, `snippets/side-cart.liquid`). Prefer rendering an existing snippet before duplicating markup logic.
- `assets/` contains every JS module (ESM) and shared styles. If functionality is reused in more than one template, move it into `assets/` and expose it via the import map.
- Text lives in `locales/en.default.json`. Ship new copy through locales so we keep translation-ready strings out of templates.

## CSS Standards

- Base typography, layout scaffolding, and tokens live in `assets/critical.css`; utility classes are defined in `assets/utilities.css`. Before writing fresh selectors, look for an equivalent utility (`.flex`, `.g-3`, `.p-5`, `.heading-h3`, etc.) so we have **one utility applied in five places, not five ad-hoc classes**.
- `assets/critical.css` is frozen—never modify it ad hoc. If you need additional primitives, surface them via `assets/utilities.css` or component-scoped styles that consume the existing tokens.
- When a bridge utility is missing and reuse is likely, add it once in `assets/utilities.css` with tokenized values (spacing, color, typography) and document the naming pattern. Component-specific tweaks that cannot be expressed with utilities can live next to the component but must use existing custom properties.
- Inline `<style>` blocks should be treated as temporary. When you touch markup that still inlines rules (see `snippets/cart-recommendations-modal.liquid`), migrate them into utilities or a shared component class so future sections stay consistent.
- Respect the design tokens exposed as CSS custom properties. Hard-coded values are only acceptable when no token exists and the design team signs off; otherwise, introduce or reuse a token first.

## JavaScript Standards

- Every script in `assets/` is an ES module. Imports resolve through aliases defined in `snippets/theme-scripts.liquid` (import map). New modules must be added there (`"@theme/your-module": "{{ 'your-module.js' | asset_url }}"`) before they can be imported elsewhere.
- Follow existing patterns: export classes or functions that encapsulate their setup, keep DOM lookups scoped via data attributes, and favor constructors that guard against multiple instantiations. Example references: `assets/critical.js` (global bootstraps), `assets/cart.js` (self-bootstrapping feature), `assets/modal-controller.js` (reusable controller).
- To activate a new feature globally, import it in `assets/critical.js` and instantiate it once. For template-only code, pair the module with a dedicated section/snippet JS entry and gate loading with Liquid (see conditional `<script type="module">` tags in `snippets/theme-scripts.liquid`).
- Avoid sprinkling raw `<script>` tags in Liquid. If you need inline behavior, create a module, expose it via the import map, and import it from the relevant entry file so we keep a single source of truth.
- Keep modules idempotent: guard event listeners, use `AbortController` or similar cleanup when binding to long-lived elements, and expose public methods instead of mutating globals. When shared logic grows, lift it into `assets/helper.js` or create a new helper module.

## Liquid & Content Reuse

- Lean on snippets to DRY repeated UI. Before creating new markup for sliders, cards, or CTA blocks, search for existing snippets (`rg 'render ' snippets`) and extend them.
- Use semantic HTML and the existing utility classes to compose layouts. Data attributes (`data-cart-tab`, `data-modal` etc.) double as JS hooks—stay consistent when introducing new hooks.
- Localize customer-facing copy. Add keys to `locales/en.default.json` and reference them with `t` filters in Liquid or inject them into the `Theme` object in `snippets/theme-scripts.liquid` when JS needs them.
- Respect structured-data and accessibility patterns already in place (e.g. aria roles in side cart, dialog semantics in modal snippets). Copy established markup when extending similar components.

## Working Expectations

- Before coding, scan for existing utilities, snippets, or modules that solve the problem; extend them rather than cloning. Standards and consolidation take priority over speed.
- Whenever an AI assistant is engaged, ensure it connects to the Shopify MCP first and draws on its guidance before consulting any other resources.
- When you introduce CSS or JS, note the dependency in the relevant section schema settings if authors need to toggle it.
- After changes, smoke-test key flows: product page gallery (`sections/product-gallery.liquid` + `assets/product-gallery.js`), side cart (`snippets/side-cart.liquid` + `assets/cart.js`), quick view (`sections/quickview.liquid` + `assets/quickview.js`), and any component you touched.
- Document anything non-obvious in commit messages or inline comments sparingly—aim for self-explanatory code that follows the existing conventions so future agents can pick it up without rework.
