<p align="start">
  <img src="https://www.quickfiredigital.com/email_images/2025-logo-reply.png" alt="Quickfire Digital logo" width="150" style="filter: invert(1);">
</p>

# Quickfire Theme v5

Quickfire Theme v5 is our opinionated Shopify starter that bakes in the layout, typography, and workflow conventions the Quickfire team relies on across projects. The repo is the single source of truth; Git manages every change, while the Shopify CLI is reserved for running a local store preview and pulling remote configuration (theme settings or template JSON) as needed.

## Core principles

- **Git-first delivery** - Branch, commit, and push code through GitHub; never rely on the Shopify admin editor for deployable changes.
- **Shopify CLI for runtime only** - Use `shopify theme dev` to run the store locally and `shopify theme pull` when you need fresh theme settings or JSON templates. All pushes go through Git.
- **Composable architecture** - Prefer sections, snippets, or assets that already exist before introducing new ones. Keep shared logic in `assets/` modules and register them via the import map.
- **Token-driven styling** - Critical tokens live in `snippets/css-variables.liquid`, `assets/critical.css`, and `assets/utilities.css`. Reuse utilities before writing bespoke selectors.
- **Translation ready** - Put customer-facing copy inside `locales/en.default.json` so strings remain ready for localization.

## Requirements

- [Git](https://git-scm.com/) for version control and pull requests
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) for local previews and pulls
- Shopify partner or dev store access tied to your CLI login
- (Optional) VS Code plus the Shopify Liquid extension for syntax and linting support

## Standard workflow

1. **Clone and branch**
   ```bash
   git clone <repo-url>
   cd quickfire-theme-v5
   git checkout -b feature/<ticket>
   ```
2. **Log in and run the store locally**
   ```bash
   shopify login --store <dev-store>
   shopify theme dev
   ```
   This streams theme files from your working tree. Hot reload reflects edits saved in Git.
3. **Pull remote settings or templates when required**
   ```bash
   # Pull only theme settings plus JSON templates into the repo
   shopify theme pull --only config/settings_data.json --only templates/*.json
   ```
   Commit the pulled JSON so configuration stays versioned alongside code.
4. **Commit and push via Git**
   ```bash
   git add .
   git commit -m "feat: describe change"
   git push origin feature/<ticket>
   ```
   Open a PR; our GitHub Actions bot warns when critical files or preview links change.

## Repository layout

```
.
|- assets/        # ES modules, global/component CSS, media
|- blocks/        # Liquid blocks for sections
|- config/        # settings_schema.json, settings_data.json, customizer defaults
|- layout/        # theme.liquid plus checkout/order layouts
|- locales/       # Translation files (add copy here)
|- sections/      # Page-level compositions (homepage, PDP, etc.)
|- snippets/      # Shared markup plus import map definitions
|- templates/     # JSON and Liquid templates wiring sections together
|- .github/       # Workflows enforcing theme standards
```

## Styling system highlights

### `assets/critical.css`

Loads on every page to establish base UX:

- Global reset, smooth scrolling, scroll-lock handling
- Responsive media defaults (images, video, SVG, embeds)
- Typography primitives for lists, paragraphs, headings, links
- Rich content scaffolding (tables, code blocks, blockquotes, dl/dt/dd)
- Form primitives, custom checkboxes, focus and error states, placeholder styling
- Interactive seeds (button reset, disabled and hover treatments)
- Fully tokenized via `css-variables.liquid`, plus fluid typography and spacing with accessible focus states

### `assets/utilities.css`

Ships the utility framework and component classes layered after critical CSS:

- Fluid typography helpers (`.heading-h0` through `.heading-h6`, `.caption-text`)
- Layout system (`.page-width` variants, `.vertical-margin` and `.vertical-padding`)
- Button suite (`.button-1` through `.button-6`), section containers, border radius utilities
- Visual helpers (gradients, badges, icons, card interactions)
- Form status helpers, custom checkbox, text clamps, list resets, `.visually-hidden`
- Comprehensive utility classes for flex, grid, spacing (`.m-3`, `.p-5`, `.g-4`), positioning, sizing, object-fit, overflow, cursor, and opacity
- Responsive prefixes (`to-md-`, `to-sm-`, `from-lg-`) and a 12-column utility grid (`.grid-section`, `.span-*`, `.product-grid`)

When extending the system:

- Reach for an existing utility first.
- Add new shared primitives to `assets/utilities.css` using design tokens.
- Component-specific overrides should live next to that component and consume the existing custom properties.

## JavaScript conventions

- Every module inside `assets/` is an ES module resolved via aliases defined in `snippets/theme-scripts.liquid`.
- Import new modules in `theme-scripts.liquid` and wire them up in `assets/critical.js` (global scope) or a section-specific entry.
- Scope DOM lookups using `data-*` hooks, guard against duplicate instantiations, and clean up long-lived listeners with `AbortController` or similar patterns.
- Avoid inline `<script>` tags; build features as modules and import them via the existing entry files.

## Theme setup checklist

Configure these settings (via **Online Store > Themes > Customize**) when onboarding a brand:

1. **Fonts** - Body and heading families
2. **Colours** - Backgrounds, text scales, brand palette (1 through 6)
3. **Typography** - Body, large body, headings (H1-H6), feature and caption styles
4. **Layout** - Page widths, vertical spacing, container padding, spacing tokens
5. **Buttons** - Global button primitives plus six variant colour systems
6. **Inputs** - Field sizing, colors, success and error styling
7. **Icons and Badges** - Sizing, colors, radius controls
8. **Search** - Predictive search, history, default content suggestions
9. **Slider Sections** - Slides-per-view plus spacing for breakpoints
10. **Imagery** - Upload fallback assets for sections, products, collections, and articles
11. **Klaviyo and Tracking** - Configure integrations (for example, GTM)

Handle settings adjustments via Git by running `shopify theme pull` (see workflow above) so these JSON changes stay version-controlled.

## GitHub Actions guardrails

The repo ships automation that nudges contributors toward best practices:

- `Theme V5 PR Checks` warns (and soft-fails) when `assets/critical.css`, `assets/utilities.css`, or `snippets/css-variables.liquid` are edited without senior review.
- The same workflow fails PRs that introduce `preview_theme_id=<id>` URLs so preview links never leak into production code.

Review the workflow definitions in `.github/workflows/` for the full context around required reviews and warnings.

## Contribution guidelines

- Prefer reusing snippets (`rg "render " snippets`) over duplicating markup; keep logic DRY.
- Localize copy via `locales/en.default.json` and reference keys with the `t` filter or via JS localization helpers.
- Document new JS or CSS dependencies in the relevant section schema when authors must toggle behaviour.
- Smoke-test critical flows (product gallery, side cart, quick view) before raising a PR.
- Keep commits scoped, and describe changes clearly so reviewers understand the impact area.

## Need more context?

- `agents.md` - Quickfire-specific standards and expectations
- `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE.md` - Governance docs
- Shopify docs - [Theme architecture](https://shopify.dev/docs/storefronts/themes/architecture) and [CLI reference](https://shopify.dev/docs/api/shopify-cli)

With Git handling delivery and the Shopify CLI dedicated to running or pulling the store, the Quickfire Theme stays predictable, reviewable, and ready for repeatable launches.
