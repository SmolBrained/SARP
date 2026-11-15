import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: ["out/**", ".next/**", "node_modules/**", "next-env.d.ts", "public/sw.js", "public/vendor/**"] },
];
export default config;
