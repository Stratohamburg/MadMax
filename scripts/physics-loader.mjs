import { register } from 'node:module';

// 支持项目声明的Node20.19+；不依赖Node新版本原生TypeScript或DOM。
register('./physics-node-hooks.mjs', import.meta.url);
