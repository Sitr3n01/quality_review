const globals = require("globals");

module.exports = [
  {
    files: ["scripts/quality/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
    rules: {
      complexity: ["warn", { max: 10 }],
      "max-depth": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
];
