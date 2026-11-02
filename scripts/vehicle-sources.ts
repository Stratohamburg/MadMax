import { readdirSync } from "node:fs";

/** 核心证据包含移出 physics/ 的控制与编排源码，避免旧哈希冒充当前实现。 */
export const vehicleSources = [
  "scripts/vehicle-sources.ts", "src/vehicle/simulation.ts",
  ...["src/vehicle/physics", "src/vehicle/control"].flatMap(dir =>
    readdirSync(dir).filter(name => name.endsWith(".ts")).map(name => `${dir}/${name}`)),
].sort();
