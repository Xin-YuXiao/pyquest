// ============================================================
// 第二批观测台控制器登记表：观测台 id（core/observatory.js 的 OBSERVATORIES 键）→ 控制器工厂
// 控制器接口：{ hasHint, keys, open(), tick(now), key(e) → 是否已处理, snapshot(), close?(), onHint?(on) }
// ============================================================
import './stations.css';
import { createMonteCarlo } from './montecarlo.js';
import { createScheduler } from './scheduler.js';
import { createGravity } from './gravity.js';
import { createBayes } from './bayes.js';

export const STATIONS = {
  montecarlo: createMonteCarlo,
  scheduler: createScheduler,
  gravity: createGravity,
  bayes: createBayes,
};
