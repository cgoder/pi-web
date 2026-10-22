import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  // demo/ is a separate Next.js project with its own lint config.
  { ignores: ["demo/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    // 临时产物目录与客户端构建产物不参与 lint
    ignores: ["temp/**", "src-tauri/**", "dist/**"],
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
