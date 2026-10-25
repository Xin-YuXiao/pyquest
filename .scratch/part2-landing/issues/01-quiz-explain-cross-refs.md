# W9-W11 题目讲解中的数值/跨章引用不一致

Status: ready-for-human
Type: grilling
Blocked by: None (can start immediately)

按 ADR-0001 题面内容以讲义为权威源，以下问题**未擅自修改**，等确认后再动。
全部位于 `explain` / `prompt` 文本，**正确选项本身都没问题**（verify-quiz 实跑通过）。

## 1. st19 有效样本量公式与 W8 的 τ 定义不一致（中）

- st19 explain：「有效样本量 Neff ≈ N/(2τ)」
- emcee 的 `get_autocorr_time()` 返回的是积分自相关时间 τ = 1 + 2Σρ(t)，
  对应 **Neff ≈ N/τ**；W8 的 dm20 也按此口径教「thin 取 ~τ 量级，留下的样本近似独立」。
- N/(2τ) 只在 τ 取「半和」定义（τ = ½ + Σρ）时成立。同一门课两种口径会让学生困惑。
- 建议：改为「Neff ≈ N/τ」（与 emcee/dm20 一致）。

## 2. st17 讲解称「W8 考过 percentile 怎么调用」（低）

- 实际考 `percentile [16,50,84]` 调用的是 **W4**（w4lair：ap19/ap21）；
  W8 的 dm20 只在讲解里顺带提到 percentile。
- 建议：改为「W4 考过 percentile 怎么调用」。

## 3. pj4 讲解称「W9 的 pcov/percentile 正是这一环的工具」（低）

- pcov 出现在 **W6**（nm3）与 **W11**（pj11），W9 没有 pcov 题；percentile 在 W9 的 st17。
- 建议：改为「W6 的 pcov、W9 的 16/84 分位正是这一环的工具」。

## 4. st9 的 3σ ↔ p 值与 st21 讲解口径不同（低）

- st9 题面：「3σ 的信号超额，换算 p = 0.001」
- st21 讲解：「单点检验 3σ（p≈0.0013）」（单侧 norm.sf(3) = 0.00135 才是准确值）
- 建议：st9 题面改为「p ≈ 0.0013」，或明确写「约 0.1%」。

## 5. README 知识点表中 W4/W8 仍列已删除的超纲知识点（低，上游遗留）

- README「游戏流程」表 W4 行仍写「Astropy units/SkyCoord」，W8 行仍写「M₂₀₀」，
  而 ADR-0001 已把它们从题库移除。ADR 称 README 清单「仅作粗略索引」，故本次未改。
- 建议：若希望 README 与题库一致，可顺手改掉（属上游内容，可一并提 PR）。

## Comments
