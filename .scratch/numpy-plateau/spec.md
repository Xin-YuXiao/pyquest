# 第三章样板：让 NumPy 本身成为玩法（科学计算高原 · 四座试炼场 + 曲线对消 BOSS）

Status: implemented（待助教试玩与拍板「待决策」各条）
Priority: P1
Source: 助教试玩反馈（2026-10-26）——「很多东西雷同且无聊」：11 章的核心循环都是「走到符文石 → 四选一 → 碎片 → 开门 → 答题破盾 → 砍 BOSS」，
251 题全是四选一，Python 会不会完全不影响怎么玩。要求：第三章先做样板，NumPy 本身变成玩法、少用选择题、关卡多、玩法多、参考市面已有游戏做新花样。

## 问题陈述

- 第三章「科学计算高原」讲 NumPy（ndarray、下标与切片、二维逗号索引、布尔掩膜、广播与向量化、arange / zeros / linspace / reshape、
  sum / mean / argmax 等统计、绘图与蒙特卡洛），但游戏里学生只做「读代码选答案」。NumPy 最有表现力的地方——一行代码同时改变一整片数据——
  在游戏里完全没有被「用出来」。
- 地图由通用生成器铺设，和第四到十一章长得一样；玩法也一样。

## 解决方案

把野外的 5 块碎片符文换成 **四座试炼场**，每座是一种借鉴成熟游戏的玩法、各有多关；巢穴的 BOSS 符文换成 **曲线对消台**。
玩家在所有试炼场里写的都是**真 NumPy 语法的一行咒语**，由游戏内的 NumPy 子集解释器（`core/npmini.js`）执行，
解释器的打印格式与报错与真 NumPy 1.26 逐条对拍（`scripts/verify-npmini.mjs`）。

| 试炼场 | 借鉴 | NumPy 概念 | 关卡 |
| --- | --- | --- | --- |
| **阵列牌局** | 《杀戮尖塔》卡牌构筑：手牌、能量、敌人意图、战后三选一 | 一维 / 二维下标与切片、负下标、步长、布尔掩膜、原地运算 `-=` `//=`、整体运算即广播 | 7 场战斗 |
| **星图拼绘** | Picross 数织：行列游程线索推理图案；Zachtronics 式按步数评分 | 二维切片赋值 `sky[1:3, 2] = 1`、整行整列、步长、向量化取反 | 7 幅星图 |
| **向量风暴** | 《吸血鬼幸存者》割草 + Noita 式自编法术 | 布尔掩膜 + 原地运算作用于整群敌人（`hp[dist < 3] -= 2`）；向量化 vs 一个个砍 | 4 波 |
| **外星信号** | 1974 年阿雷西博信息：1679 = 23 × 73 比特 reshape 成图 | reshape 与 shape、行优先顺序、`[::-1]` 翻转、`.T` 转置 | 6 段信号 |
| **曲线对消**（BOSS） | Graphwar / Sine Rider：输入函数画曲线 | `np.linspace` 给出 x、`np.sin` 向量化、振幅 / 频率 / 平移 | 3 层护盾 |

- 每座试炼场的核心关全部通过 → 1 枚数值碎片；四座 → 4 枚 → 巢穴封印打开（第三章 `shardsNeeded` 由 5 改为 4）。
- 每座试炼场另有 1 个可选挑战关（不计入碎片，完成回满爱心）。
- 野外 2 块祝福符文（四选一，回血）与蒙特卡洛观测台保留为可选内容；巢穴 3 块祝福符文保留。第三章必经路径上**不再有四选一题**。

## 实现决策

- **NumPy 子集解释器 `core/npmini.js`（纯 JS、无 DOM）**
  - 语句：表达式、`名字 = 表达式`、`下标赋值`、增强赋值 `+= -= *= /= //= %= **=`；`;` 分隔多句；`import numpy as np` 视为无操作。
    不支持 for / while / if / def / lambda（友好报错：「这里只认一行向量化咒语」）。
  - 值：Python int / float / bool / None / list / tuple / slice、ndarray（int / float / bool 三种 dtype，任意维）。
    视图语义与 NumPy 一致：基本切片返回共享缓冲区的视图，花式 / 布尔下标返回副本；每个结果附带「来源位置」（provenance），
    小游戏据此知道一个选择器选中了原数组的哪些格子。
  - 运算：+ − × / // % **、比较（支持链式比较的 Python 语义）、& | ^ ~、一元 ±；广播规则、dtype 提升、numpy 布尔减法 / 取负报错、
    整数负幂报错等与 NumPy 1.26 一致；Python 标量之间按 Python 语义（`1/0` → ZeroDivisionError），ndarray 除零得 inf / nan。
  - 下标：整数、负数、切片（含负步长）、None（newaxis）、布尔掩膜、整数数组（花式），按 NumPy 规则组合（高级下标相邻时就地插入、否则提到最前）。
  - 函数：np.array / arange / zeros / ones / full / linspace / sum / mean / max / min / argmax / argmin / std / sqrt / sin / cos / exp / log / log10 / abs /
    floor / ceil / round / where / sort / count_nonzero / any / all / pi / e / inf / nan / newaxis；方法 sum mean max min argmax argmin std any all
    reshape flatten ravel copy astype T transpose；属性 shape ndim size dtype；内置 len print abs int float bool min max sum round。
  - 打印：`str()` 完整复刻 numpy 1.26 的 array2string（整数右对齐、布尔「 True」、浮点 maxprec 8 位 + 小数点对齐 + 科学计数切换规则、75 字符折行）。
  - 安全：元素数上限 10 万、源码长度上限、递归深度上限；报错给 Python 原文 + 中文解释。
- **试炼场框架**：野外新道具 `type: 'trial'`（交互物，按 E 打开对应小游戏）；进度存 `G.trials[gameId] = { levels: { [levelId]: { at, best } }, ... }`，
  存档 v3 可选字段 `trials`（旧档缺省为空、读档清洗）；`core/trials.js` 维护「关卡完成 → 试炼场完成 → 发碎片」规则（纯函数，smoke 校验）。
  每个小游戏是 `src/games/<id>/` 下的独立模块，由 `src/games/index.js` 登记；共用 `ui/SpellInput.js`（输入行 + 实时预览 + 报错 + 快捷符号键）。
- **测试接缝**：只读 `trials()` 快照；语义动作 `openTrial(gameId, levelId)`、`winTrialLevel(gameId, levelId)`。

## 测试决策

- `scripts/verify-npmini.mjs`：数百条表达式在解释器与真 NumPy 1.26 上分别执行，比对 print 输出与异常类型；
  每个小游戏每关的参考解在真 NumPy 上重跑，确认「游戏判定过关」与「真 NumPy 算出的结果」一致。
- smoke：关卡数据完整性（参考解、提示、线索可解）、试炼场进度规则、存档往返。
- E2E：每个小游戏至少一关用真实键盘输入参考解过关；第三章全流程（四座试炼场 → 开门 → 曲线对消 → 击败 BOSS）。

## 待决策（需助教确认）

1. 概念范围：上表概念取自现有 W3 题库（np1–np14、nb1–nb4、mp1–mp9）；`.T`、`axis=`、`np.where`、负步长若讲义 W3 未讲，对应关卡改为挑战关。
2. 第三章 `shardsNeeded` 5 → 4 是否接受（推荐：接受，一座试炼场一枚）。
3. 其余章节是否按同样思路改造（推荐：先试玩第三章，确认方向再推开）。

## 不做的事

- 不接入真 Pyodide + NumPy（离线 / 国内网络 / 首屏体积）；子集解释器 + 真 NumPy 对拍代替。
- 不做排行榜；评分只和关卡参考解比较。

## 实现记录（2026-10-26，分支 `feat/ch3-numpy-games`）

| 小游戏 | 关卡 | 规则模块 | 纯逻辑校验 | E2E |
| --- | --- | --- | --- | --- |
| 阵列牌局 | 史莱姆一排 / 末尾的刺客 / 切片之墙 / 步长伏兵 / 筛子 / 方阵 / 混沌先锋 + ★不死军团 | `games/cards/battle.js`（`autoplay.js` 用贪心打法校验每关首次尝试在 par 内可赢、12 个种子胜率） | `verify-game-cards.mjs` | `e2e-game-cards.mjs` |
| 星图拼绘 | 北极星 / 流星雨 / 土星 / 导星框 / 校准网格板 / 玻璃底片 / 射电望远镜 + ★空间站 | `games/picross/logic.js`（线索求解器验证唯一解） | `verify-game-picross.mjs` | `e2e-game-picross.mjs` |
| 外星信号 | 第一声 / 倒着来的信号 / 镜中的字 / 噪声里的行星 / 一次性密钥 / 四色星系 / 迷你阿雷西博 + ★一列一列的信号 | `games/signal/logic.js`（比特数只有一种行列分解） | `verify-game-signal.mjs` | `e2e-game-signal.mjs` |
| 向量风暴 | 史莱姆潮 / 近身防卫 / 斩杀线 / 精英混编 + ★无尽潮 | `games/arena/rules.js`（构造数组 → 执行 → 按 hp 下降结算伤害与法力） | `verify-game-arena.mjs` | `e2e-game-arena.mjs` |
| 曲线对消 | 纯正弦 / 振幅 / 频率 / 混沌之心 + ★混沌本体 | `games/curve/rules.js`（残差 ≤ 0.05） | `verify-game-curve.mjs` | `e2e-game-curve.mjs` |

- 第三章章节 E2E 改走 `collectGames` / `bossGame` 两个 runner 步骤；野外布局改为手工的「阵列广场」（`data/maps.js` 的 `gameRing`）。
- 实现与规格的偏差：向量风暴为 4 核心关（规格写 4 波，一致）；外星信号的 `.T` 只在挑战关；星图拼绘的 `sky.sum(axis=…)` 读数只在提示里开放。
