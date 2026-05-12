const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      ".agents/**",
      ".claude/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "node_modules/**",
      "reports/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
