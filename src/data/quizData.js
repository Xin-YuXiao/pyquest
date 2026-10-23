// ============================================================
// 兼容 re-export 枢纽（quizData 行为/数据分层后的旧入口）。
// 拆分后各归其位：
//   - 纯数据 QUESTIONS / POOLS / SLOT_POOL → data/quizBank.js
//     （题面内容权威源，ADR-0001；槽位映射依赖 chapters.js 注册表，
//      属数据层内部组装，随数据走）
//   - 行为函数 pickQuestion / highlight → core/quiz.js
//     （依赖 core/state.js 的 G 与数据层，方向单向）
// 旧 import 路径继续可用；新代码请直接从上述两个文件导入。
// ============================================================

export { QUESTIONS, POOLS, SLOT_POOL } from './quizBank.js';
export { pickQuestion, highlight } from '../core/quiz.js';
