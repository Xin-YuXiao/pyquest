# 03: 程序化星系生成 + 特征 + 分类器 + 评估指标（纯函数核心）

Status: resolved
Type: task
Blocked by: None (can start immediately)

## 要做什么

建立分类台的纯函数核心，不含任何界面，全部可在 Node 下由 smoke 校验：

- `generateGalaxy(seed, cls)`：输出类别、颜色代理、光度集中度、轴比、旋臂数与强度、双核/潮汐尾标志、标签置信度；支持椭圆 / 旋涡 / 并合（预留不规则）；
- `renderGalaxy(ctx2d, params, size)`：在给定 canvas 2D 上下文上绘制卡通星系（Node 下用桩上下文跑通即可，与 smoke 的伪 Canvas 做法一致）；
- `measureFeatures(params, rng)`：生成参数 + 测量噪声 → 特征向量；
- `makeDataset(seed, { n, classMix })`：按类别比例生成样本，固定种子划分训练/测试；
- 分类器：`stump.fit/predict`（单特征阈值，含自动寻优）、`knn.fit/predict`（标准化后欧氏距离）、`majorityBaseline`；
- 指标：`confusionMatrix(yTrue, yPred, classes)`（行=真实、列=预测）、`accuracy`、`recallPerClass`。

## 验收标准

- [ ] 同种子生成结果逐字段相同；不同种子不同
- [ ] 各类在主特征上可分（smoke 断言类均值差超过若干倍噪声标准差），且确有少量「专家分歧」样本（置信度 < 1）
- [ ] 手算小样例上混淆矩阵/准确率/召回率正确，含某类 0 样本的边界
- [ ] 2% 稀有类数据集上多数类基线准确率 ≈ 98%、稀有类召回率 = 0
- [ ] 可分样例上树桩自动寻优达到 100%；k=1 近邻训练准确率 100%
- [ ] smoke 新增上述校验；`npm run check` 全绿

## Comments

- 2026-10-25：feat/more-stations 实现：程序生成卡通星系 + 特征 + kNN + 混淆矩阵 / 召回（纯函数）。
