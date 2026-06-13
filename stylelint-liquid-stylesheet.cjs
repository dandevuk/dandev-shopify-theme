// Normalizes Shopify `{% stylesheet %}` blocks to `<style>` so postcss-html can lint them.
const postcssHtml = require("postcss-html");

const baseSyntax = postcssHtml();
const openTagPattern = /\{%-?\s*stylesheet\s*-?%}/gi;
const closeTagPattern = /\{%-?\s*endstylesheet\s*-?%}/gi;
const openMarker = (match) => `<style data-liquid-stylesheet="${match}">`;
const closeMarker = (match) => `</style><!--stylelint-liquid-end:${match}-->`;

const normalizeLiquidStyleTags = (source) =>
  source
    .replace(openTagPattern, (match) => openMarker(match))
    .replace(closeTagPattern, (match) => closeMarker(match));

const denormalizeLiquidStyleTags = (source) =>
  source
    .replace(/<style data-liquid-stylesheet="([^"]*)">/gi, (_, original) => original)
    .replace(/<\/style><!--stylelint-liquid-end:([\s\S]*?)-->/gi, (_, original) => original);

module.exports = {
  parse(source, opts) {
    return baseSyntax.parse(normalizeLiquidStyleTags(source), opts);
  },
  stringify(root, builder) {
    // Stylelint applies fixes through the stringifier; convert markers back to Liquid.
    baseSyntax.stringify(root, (str, node, type) => {
      builder(denormalizeLiquidStyleTags(str), node, type);
    });
  },
};
