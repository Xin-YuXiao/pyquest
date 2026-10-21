# W4-W8 出题提纲（供审阅 · 素材对齐 2026 版讲义）

> 依据：`/Users/uranus/Desktop/P4A@UCAS/P4A@UCAS-latest/Notebooks/` 精读报告（暂存
> `$TMP/opencode/p4a-notes/reports/`）。结构决策：每章 3 池 `{w}shard×10 / {w}lair×7 / {w}boss×3`
> （heal 与 lair 共用池），tier 每章递进 3 档：w4=11/12/13 → w8=23/24/25。
> 「素材」标注 = 该题可直接采用讲义中有确定输出的代码。

## 第四章 · 天文包星图塔（单位术士）· w4shard(11) / w4lair(12) / w4boss(13)

| 池 | 题目知识点分配 |
| --- | --- |
| shard ×10 | HDU 三类型（Primary/BinTable/Image）· FITS=header+data · HEALPix 等面积像素化 · HDF5 分层结构(path) · emcee 定位（现有 ap4 改造）· Column format='D' 含义 · writeto(overwrite=True) · 数据格式选型（FITS/Pandas/HDF5 场景）· conda 环境管理 · OM10 星表是什么 |
| lair ×7 | `table_data.names` 列名 · FITS 布尔掩膜选行(NIMG==2) · EnsembleSampler 四参数 · get_chain(discard/thin/flat) · log_prior 界外 −inf · percentile [16,50,84] 报告 · train_test_split 80/20（素材：split_ratio=0.8） |
| boss ×3 | HDUList append/insert 后索引与计数推理 · 掩膜+列运算 `IMSEP*(ZLENS+1)`=4.0（素材）· log_probability 组合逻辑（prior −inf 短路） |

## 第五章 · 加速熔炉（迟缓巨魔）· w5shard(14) / w5lair(15) / w5boss(16)

| 池 | 题目知识点分配 |
| --- | --- |
| shard ×10 | RULE NO.1 减少循环 · RULE NO.2 找现成方案（quad 彩蛋）· KISS（现有 sp5）· 奥卡姆剃刀 · GIL 与多进程 · 串行 vs 并行 · @jit(nopython=True) · mpirun -np 4 · JAX 定位 · 函数调用昂贵（循环内调函数反模式） |
| lair ×7 | Simpson 1-4-1 权重与 Δx/3 · numba 实现循环步长 2 · comm.Bcast/Scatterv/Reduce 集合通信（对齐讲义大写 API）· Pool(cores)+p.map+array_split · ctypes 五步（CDLL/argtypes/restype）· OpenMP critical 归并 · divmod 分块 ave=25000000/res=1（素材） |
| boss ×3 | **N 奇偶陷阱**（100000001 是奇数，复合 Simpson 要偶）· **mpi 任务分配**（nruns=15/size=4：Task 7→rank 3）· 八种实现殊途同归 ∫sin=1.0（素材：概念综合） |

## 第六章 · 数值方法神殿（优化牛头怪）· w6shard(17) / w6lair(18) / w6boss(19)

| 池 | 题目知识点分配 |
| --- | --- |
| shard ×10 | quad 返回 (值,误差) 元组 · dblquad 二重积分 · odeint model 签名 **(y,x)**（陷阱题）· interp1d 返回函数 · kind='cubic' · root_scalar(secant) vs root(hybr) · curve_fit popt/pcov · scipy.misc.derivative · np.gradient · MLE=最小化负对数似然（概念） |
| lair ×7 | quad args= 传参 · secant 需两初值+sol.root 属性 · curve_fit bounds= · LinearNDInterpolator 2D 散点 · 二阶 ODE 降阶 u=[y,z] · np.triu 势能上三角 · softening 软化长度作用 |
| boss ×3 | **N-body 成对差** `dx@mass` → [[3.],[1.8],[0.6],[-0.6],[-1.8],[-3.0]]（素材，广播+矩阵乘）· **dblquad 手算** x·y² → 2/3≈0.6667（素材）· np.gradient 二维 → axis0 全 100.0/axis1 全 10.0（素材） |

## 第七章 · 信号圣殿（傅里叶魅影）· w7shard(20) / w7lair(21) / w7boss(22)

| 池 | 题目知识点分配 |
| --- | --- |
| shard ×10 | scipy.linalg vs numpy.linalg（BLAS/LAPACK）· 特征方程 \|A−λI\|=0 · ifft 还原信号 · σ 置信表（1σ=68%、5σ 发现标准）· solve vs inv 推荐性 · matrix_rank/det 语义 · 卷积定理（频域逐点乘）· correlate2d 模板匹配 · sklearn fit/predict · 随机森林 n_estimators=100 |
| lair ×7 | **np.cov 手算** [[10,1],[1,10]]（素材）· inner/outer/Hadamard 三积对比 · 频率轴 freq=n/T、T=N/sr（Nyquist）· convolve2d+Scharr 边缘检测 · accuracy_score/ConfusionMatrixDisplay · 向量投影 80/271·b（素材）· 讲义找 bug 题（np.dot(B,inv(A)) 顺序错） |
| boss ×3 | **FFT 峰值**：1/4/7 Hz 幅度 3000/1000/500=A·N/2（素材）· **solve 手算** [5,3,-2]（素材）· inner=80 vs a*b=[0,6,14,24,36] 对比（素材） |

## 第八章 · 深空晕环（NFW 幻龙）· w8shard(23) / w8lair(24) / w8boss(25)

| 池 | 题目知识点分配 |
| --- | --- |
| shard ×10 | NFW 公式形状 ρ(r)=ρ₀/[(r/Rₛ)(1+r/Rₛ)²] · **ρ(Rₛ)=ρ₀/4** · 内 r⁻¹/外 r⁻³ 渐近 · N-body 纯引力 · 密度↔质量互为积分/微分 · MCMC 四要点（随机/链式/接受拒绝/收敛）· 逆变换采样 X=F⁻¹(U) 概念 · emcee EnsembleSampler 定位 · corner 角图对角线=marginalized 后验 · log_prior/log_likelihood 分工 |
| lair ×7 | interp1d(mm,rr) 反转 CDF 原理 · arccos(2u−1) 球面均匀（cos θ 均匀）· 对数空间拟合+isinf 掩码 · thin/discard 语义 · 自相关时间 τ 含义 · get_autocorr_time 用途 · 密度拟合 vs 质量拟合孰优（质量=积分更平滑） |
| boss ×3 | **质量积分** M=4πρ₀Rₛ³[...] → 2.5257（素材）· **chain shape** (5000,32,2)→discard1000/thin15/flat=8512、thin2=64000（素材）· 球壳密度 N·m/(4πr²Δr)=8e-3（素材） |

## 结构改造（题目之外）

1. `chapters.js`：W4-W8 的 `pools` 从单池改为 `{ shard: 'w4shard', heal: 'w4lair', lair: 'w4lair', boss: 'w4boss' }` 式映射
2. `quizData.js`：新增 15 个池 + 100 题；W4-W8 现有 25 题按知识点并入对应新池
3. 自动校验脚本 `scripts/verify-quiz.mjs`：用本机 python3（anaconda，astropy 7.2/numpy 1.26/scipy 1.15/sklearn 1.9 齐备）执行有确定输出的 code 块，比对 answer
4. smoke.mjs：校验新池 tier 一致性/槽位映射
5. E2E：五章各补一条（W4-W8 各选一条代表性全流程，复用 e2e-ch3 模式）

## 已决策事项（2026-10-21 grilling 会话敲定）

1. **ODE 双轨并存**：保留 solve_ivp（SciPy 官方推荐）+ 新增 odeint `model(y, x)` 参数顺序陷阱题（讲义原文签名）
2. **sklearn 分工**：W4 出流程链（train_test_split→fit→predict→accuracy_score），W7 出评估与超参（混淆矩阵/RandomForest 超参），不重复
3. **全面对齐讲义**（Q13-C）：超纲/分歧题替换——
   - ap2（astropy units 换算，超讲义正文）→ 替换为讲义内知识点题（如 healpy 掩码）
   - ap3（SkyCoord，超讲义正文）→ 替换为讲义内知识点题（如 HDF5 path 层级）
   - dm2（M₂₀₀，讲义未出现）→ 替换为质量积分公式题（讲义核心）
   - sp4（小写 `comm.bcast`）→ 改为讲义的大写 `comm.Bcast`（数组缓冲区广播）
   - 其余现有题按知识点并入对应新池
