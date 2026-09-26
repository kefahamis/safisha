import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler advice: loading data or syncing props in an effect costs an
      // extra render, not correctness. Kept visible as a warning.
      "react-hooks/set-state-in-effect": "warn",
      // `const { secret: _secret, ...rest } = row` is how fields are dropped here.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", ".data/**", "drizzle/**", "next-env.d.ts"],
  },
];

export default config;
