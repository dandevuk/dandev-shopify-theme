import globals from "globals";

export default [
  {
    ignores: [
      "assets/fuse.js",
      "assets/body-scroll-lock.js",
      // add more vendor files here if needed
    ],
  },
  {
    files: ["assets/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser, // window, document, etc.
        Theme: "readonly",
        Shopify: "readonly",
        bodyScrollLock: "readonly",
        klaviyo: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: "error",
      "no-debugger": "error",
    },
  },
];
