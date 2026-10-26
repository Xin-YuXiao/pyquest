# PyQuest · Python 冒险记 ⚔️

一款**用塞尔达式动作冒险学习 Python 天文应用**的网页游戏。
关卡体系对齐 **P4A@UCAS（Python for Astronomy）64 学时课程**：一周一章，分两部共十一章——
第一部（W1-W8）从 Python 基础一路打到暗物质晕密度轮廓拟合，
第二部（W9-W11）进入统计学基础、vibe coding 方法论与 project 毕业试炼。
画风致敬《塞尔达传说：织梦岛》Switch 重制版 + 欧美 Q 版卡通：俯视角、大头小身比例、
描边卡通渲染（帽子/羽毛/肩带/宝珠等层叠细节）、柔和粉彩配色、无像素马赛克的矢量渲染。
**全部角色以 4 倍尺寸显示**，环境物件按 2.5 倍跟随缩放。
美术采用 [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords)（Pixel Frog · Free Pack，本地素材包）
+ 少量同风格程序化贴图（代码碎片/爱心/传送门等游戏专属元素）。

> [!NOTE]
> **本项目完全由 GLM-5.3 Vibe Coding 而成** —— 从玩法设计、架构搭建、场景/实体实现、
> 题库编写到美术整合与 E2E 测试脚本，全部代码均通过与 [GLM-5.3](https://chat.z.ai)
> 的对话式协作（Vibe Coding）生成，未手写一行代码。

![技术栈](https://img.shields.io/badge/Phaser%203-90.x-green) ![构建](https://img.shields.io/badge/Vite-7.x-purple) ![素材](https://img.shields.io/badge/Art-Tiny%20Swords%20%2B%20程序化-blue) ![开发方式](https://img.shields.io/badge/GLM--5.3-Vibe%20Coding-ff6f00) ![许可证](https://img.shields.io/badge/License-MIT-blue)

## 🎮 运行

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 产出 dist/，可部署到任意静态托管
npm run preview    # 本地预览构建产物
npm run check      # 全部验证（lint / 冒烟 / 题库实跑 / 构建 / 全章节 E2E），见「测试」
```

## 🕹️ 操作

| 按键 | 功能 |
| --- | --- |
| 方向键 / WASD | 移动 |
| J / 空格 | 挥剑攻击 |
| E | 交互（符文石 / NPC / 石门 / 观测台 / 秘藏石碑 / 秘境与训练场之门） |
| Tab | 世界地图（查看各章进度 / 快速传送已解锁章节 / 错题本入口） |
| M | 静音开关（音效 + 背景音乐） |
| N | 只开关背景音乐（设置会记住） |
| Esc | 关闭观测台 / 秘藏卷轴；在「无限回廊」里按它跳出循环 |
| Ctrl+Enter | 代码训练场里运行代码 |

**手机 / 平板**：横屏最佳。左半屏任意位置按住拖动 = 虚拟摇杆；右下角「挥剑」「交互」按钮
（附近有可交互物时交互键发金光）；右上角世界地图与静音。

## 🗺️ 游戏流程（64 学时课程 = 两部十一章关卡）

游戏由 `src/data/chapters.js` 注册表驱动：每章 = **野外**（碎片符文 + 引导 NPC + 封印门）+ **巢穴**（BOSS 符文破盾 + BOSS 战）。
通关当前章后，野外的「前方传送门」开启，进入下一章；也可随时返回上一章补答符文。

| 章 | 课程周次 | 世界 / BOSS | 知识点 |
| --- | --- | --- | --- |
| 第一章 · 基础村 | Week 1 | 诺瓦村庄 + 数据地牢 / 数据史莱姆王 | 变量、运算符、字符串、print、列表、元组 |
| 第二章 · 函数之森 | Week 2 | 函数之森 + 控制流洞窟 / 巨蟒毕森 | def/参数/return/作用域、字典、if/while/for/break |
| 第三章 · 科学计算高原 | Week 3 | 科学计算高原 + 混沌巢穴 / 混沌曲线魔君 | ndarray、索引切片、广播、向量化、arange/linspace、掩膜、matplotlib、蒙特卡洛估π、quad |
| 第四章 · 天文包星图塔 | Week 4 | 星图塔平原 + FITS 神殿 / 单位术士 | FITS header/data、Astropy units/SkyCoord、healpy、emcee、sklearn |
| 第五章 · 加速熔炉 | Week 5 | 加速熔炉 + 迟缓深渊 / 迟缓巨魔 | 向量化、numba @jit、multiprocessing、mpi4py、KISS 法则 |
| 第六章 · 数值方法神殿 | Week 6 | 数值神殿外庭 + 优化迷宫 / 优化牛头怪 | quad 积分、solve_ivp、curve_fit、brentq 求根、interp1d |
| 第七章 · 信号圣殿 | Week 7 | 信号圣殿平原 + 频域回廊 / 傅里叶魅影 | eig 特征值、cov 协方差、FFT、卷积、sklearn fit/predict |
| 第八章 · 深空晕环 | Week 8 | 深空晕环 + 暗物质核心 / NFW 幻龙 | NFW 轮廓、M₂₀₀、N-body 引力模拟、密度→质量积分 |
| 第九章 · 统计圣所 | Part II · W9 | 圣所外庭 + 后验回廊 / 贝叶斯祭司 | 描述统计、泊松涨落、误差传播、中心极限、似然/χ²、贝叶斯先验/后验、p 值与置信区间、MCMC 收敛诊断 |
| 第十章 · 灵思之塔 | Part II · W10 | 灵思之塔底层 + 验证回廊 / 幻言魔像 | vibe coding 流程、prompt 分解、幻觉识别、测试先行、小步迭代、回归检查 |
| 第十一章 · 毕业试炼 | Part II · W11 | 毕业试炼场 + 三途之门 / 三途守门人 | 选题与文献、拟合/模拟/机器学习三类 project workflow、不确定度、泛化、科学报告 |

> 第一、二章为手工地图（内容已按周次重对齐题池）；第三章是 **NumPy 玩法样板章**（野外是「阵列广场」+ 四座试炼场，
> 巢穴的 BOSS 护盾是曲线对消，见下一节）；
> 第四至八章为通用生成器关卡，题库已充实至**每章 20 题**（shard/lair/boss 三池式）。
> 第二部第九至十一章同为通用生成器关卡、三池式题库（第九章 21 题，第十、十一章各 20 题），
> 规划见 `docs/part2-plan.md`，出题提纲见 `docs/quiz-outline-w9.md` ~ `w11.md`。

### 单章流程

1. **野外**：阅读引导石碑（或与长老对话）；击败游荡的小怪（掉落爱心）。
2. **碎片符文 ×N**：答对 Python 问题获得本章碎片（**题目从同难度题池随机抽取**，每次遇到的都可能不同）。
3. **封印门**：集齐碎片解锁（按 E 当场解开），进入本章巢穴。
4. **巢穴**：祝福符文（答对回心）+ **BOSS 符文**（答对破除护盾，才能造成伤害）。
5. **击败 BOSS** → 本章结算（用时/谜题数/章节进度）→ 前方传送门通往下一章。

## 🔢 第三章样板：NumPy 本身就是玩法

十一章原来的核心循环都一样：「走到符文石 → 四选一 → 碎片 → 开门 → 答题破盾 → 砍 BOSS」，Python 会不会完全不影响怎么玩。
第三章先改成样板：**必经路径上没有选择题**，学生在每座试炼场里写的都是一行（或几句）**真 NumPy 语法**，
输入时实时预览结果，报错给 Python 原文 + 中文解释。每种玩法借鉴一款成熟的游戏：

| 试炼场 | 借鉴 | 怎么玩 | NumPy 概念 | 关卡 |
| --- | --- | --- | --- | --- |
| 🃏 **阵列牌局** | 《杀戮尖塔》卡牌构筑 | 敌人排成数组 `hp`（后期是二维阵型），「选择器卡」拼「操作卡」打出 `hp[1:4] -= 3`；只打操作卡 = 整个数组一起算。敌人有攻击意图，敌人的回合也写成 NumPy 记进战斗日志；「自由咒语」卡的方括号自己写；战后三选一奖励卡进牌组，按回合数给奖牌 | 下标、负下标、切片、步长、二维逗号索引、布尔掩膜、原地运算、广播 | 史莱姆一排 → 末尾的刺客 → 切片之墙 → 步长伏兵 → 筛子 → 方阵 → 混沌先锋，★ 不死军团 |
| ✦ **星图拼绘** | Picross 数织 + Zachtronics 式按步数评分 | 按行列游程线索推理出星座，只能用切片赋值作画（`sky[1:3, 2] = 1`），输入时金色 / 红色幽灵格预览；画对后上色揭晓 + 一句天文知识；施法句数对照参考解给金银铜 | 二维切片赋值、整行整列、负下标、步长、`sky = 1 - sky` 向量化取反 | 北极星 → 流星雨 → 土星 → 导星框 → 校准网格板 → 玻璃底片 → 射电望远镜，★ 空间站（线索均验证唯一解） |
| 📡 **外星信号** | 1974 年阿雷西博信息（1679 = 23 × 73 比特） | 射电望远镜收到一维 0/1 比特流，`reshape` 成正确的形状才显出图案（形状错了是斜条纹——行优先顺序一目了然），再配合翻转、阈值、异或密钥、双路合成 | `reshape` 与 shape、`[::-1]` / `[:, ::-1]`、比较掩膜、`(a + b) % 2`、`hi * 2 + lo`、`.T`（挑战关） | 第一声 → 倒着来的信号 → 镜中的字 → 噪声里的行星 → 一次性密钥 → 四色星系 → 迷你阿雷西博，★ 一列一列的信号 |
| ⚡ **向量风暴** | 《吸血鬼幸存者》割草 + Noita 自编法术 | 独立的实时竞技场：成群史莱姆冲过来，战前在备咒台写两句法术（`hp`、`dist`、`elite` 三个数组），战斗中按 Q / R 释放；法力 = 造成的总伤害，掩膜写得越准越划算；挥剑一次只打一只——体会向量化一次打一片 | 布尔掩膜 + 原地运算作用于整群敌人、`~` 取反 | 史莱姆潮 → 近身防卫 → 斩杀线 → 精英混编，★ 无尽潮（坚持 90 秒） |
| 〰 **曲线对消**（BOSS 护盾） | Graphwar / Sine Rider 函数作图 | 示波器上是混沌曲线魔君的护盾波形（表达式隐藏），从图上读出中线、振幅、起伏次数，写出 `A * np.sin(w * x) + b` 逐点抵消；四层全部对消才破盾，接着打原有的「正弦混沌弹」 | `np.linspace`、`np.sin` 向量化、振幅 / 频率 / 平移、两条波叠加 | 纯正弦 → 振幅 → 频率 → 混沌之心，★ 混沌本体 |

- **入口与进度**：野外中央是手工布局的「阵列广场」——方形路面与十字路口把高原分成 2×2 的格子，四座石台站在四个角（标着
  `高原[0, 0]` … `高原[1, 1]`）。一座试炼场的核心关全部通过 = 1 枚数值碎片，**4 枚**打开巢穴（第三章碎片数由 5 改为 4）；
  挑战关 ★ 首次通过回满爱心。野外 2 块祝福符文与蒙特卡洛观测台保留为可选内容。
- **咒语解释器** `src/core/npmini.js`：NumPy 子集（int / float / bool 任意维数组、视图与副本语义、广播、dtype 提升、各种下标、
  常用函数与方法），打印完整复刻 numpy 1.26 的格式；`scripts/verify-npmini.mjs` 用 400 多条用例（含每个小游戏每关的参考解）
  与真 NumPy 逐字对拍。不支持 for / if 等语句——提示学生「用一行向量化咒语」。
- **共用设施**：分级提示（概念 → 关键写法 → 参考解）、成绩与金银铜牌、未完成的作答会保存（存档 v3 可选字段 `games`）。
- **待助教确认**：`.T`（外星信号挑战关）、`axis=`（星图拼绘提示里的读数）、花式下标（牌局自由咒语允许但不要求）是否超出 W3 讲义；
  碎片 5 → 4。设计与决策见 [`.scratch/numpy-plateau/spec.md`](.scratch/numpy-plateau/spec.md)。

## 🆕 新关卡

| 关卡 | 入口与解锁 | 怎么玩 | 教学用意 |
| --- | --- | --- | --- |
| **Project 秘境**（4 个） | 诺瓦村庄东南角「秘境之门」，**第一部（第八章）通关后**开启 → 秘境大厅；世界地图东南角「Project 秘境」区块可直达 | 每个秘境是一张新地图：外庭里 5 块课题符文按 Project 工作流**按顺序**解锁（选题 → 文献 → 数据 → 分析 → 验证），圣所里第 6 步「报告」是 BOSS 符文，破盾后打 BOSS，通关得课题徽章。四个秘境：**P4 暗晕重建**（外庭还有 NFW 拟合台）、**P1 双爱因斯坦环**、**P2 透镜建模**、**P5/7 星系与光谱分类** | 把散落在各章的知识串成一个真实课题的完整工作流；全部复用题库已有题目（间隔复习），答错照样进错题本 |
| **无尽试炼塔** | 世界地图西侧「试炼塔」地标，**第三章通关后**开放 | 随机生成的楼层，答对本层全部塔符文开启上楼阶梯；每 3 层小怪变多变强，每 5 层一个借用已通关章节 BOSS 机制的「守层者」，之后是能回 1 心的休息平台；爱心归零结束，结算页显示到达层数、正确率、本次复习了几道错题、个人最佳 | 只出已通关章节的题，**错题本里的题优先**、其次是很久没见过的题——游戏化的间隔复习；主线爱心与进度完全不受影响 |
| **代码训练场**（7 关） | 第二章森林里的金色「代码训练场」门，**第一章通关后**开启 | 在编辑器里写**真 Python**（浏览器内 Pyodide 运行，离线可用），用 `move()` / `look()` / `jump()` / `attack()` 驱动勇者过格子房间：顺序执行 → for 长桥 → if 陷阱走廊 → while 迷雾小径 → def 台阶阵 → 列表碎片清单 → 综合关；运行后勇者逐步回放（可 3 倍速 / 跳过），报错翻成中文并标行号，两级提示，记录行数 / 步数个人最佳 | upstream 路线图的「真实代码执行」；关卡清单与概念顺序见 `docs/code-dojo.md`（待助教对照讲义审核） |

## ✨ 新玩法

| 玩法 | 在哪 / 怎么玩 | 教学用意 |
| --- | --- | --- |
| **BOSS 招牌机制** | 每章 BOSS 破盾后各有一个与本章知识点呼应的机制，顶部横幅说明规则：第三章正弦弹道、第五章迟缓光环 + 「向量化」加速、第六章梯度下降冲锋（步长衰减）、第七章三个频率分身须按频率从低到高击破、第八章 NFW 引力牵引、第九章「后验更新」预判瞄准、第十章幻觉符文（只有带金印的是真的）、第十一章三途三阶段…… | 把抽象概念变成身体记得住的打法 |
| **观测站小游戏**（7 座） | 各章野外的观测台，按 E 打开：第三章**蒙特卡洛估 π**（撒点看误差按 1/√N 下降）· 第五章**并行搬砖**（12 个任务分给 4 个 worker，看甘特图做负载均衡）· 第六章**引力沙盒**（拖初速度让卫星绕 3 圈；把 softening 调到 0 看近距离飞散）· 第七章**频率调谐台**（找 1 / 4 / 7 Hz 三个峰）· 第八章 **NFW 拟合台**（拖对数滑块把 χ²/dof 压到 1.5 以下）· 第九章**贝叶斯硬币**（抛硬币看先验 × 似然 → 后验收窄）· 第十一章**星系分类台**（先自己分类看混淆矩阵，再选特征训练 kNN、识破「高准确率但稀有类召回为 0」的陷阱） | 亲手调参数理解拟合、频谱、统计与机器学习；数值全部对齐题库已有题目（代码注释里注明题号） |
| **Python 秘藏** | 每章野外藏一块发光的 `>>>` 石碑（共 11 块），按 E 展开：`import this`、`0.1 + 0.2`、`from __future__ import braces`、`import antigravity`（勇者浮空，可飞越水面）、`while True` 无限回廊（按 Esc 发出 KeyboardInterrupt 跳出）…… 世界地图显示「秘藏 x / 11」 | Python 文化常识；石碑里的每段输出都由本机 python 实跑校验 |
| **错题本** | 世界地图（Tab）头部「错题本（N）」：答错过的题自动入册，可按章节 / 符文类型筛选，点「复习」重做（选项打乱、不扣心、不发碎片），连续答对 2 次记为「已掌握」 | 答错不再只是扣一颗心；每次作答都记入学习记录 |
| **背景音乐** | 零素材的程序化 8-bit 音乐：每章野外各有主题、巢穴 BOSS 战、胜利号角；答题时自动压低到 15%；N 键开关 | 有氛围但不打扰答题 |
| **手机触控** | 见上方「操作」 | 学生用手机也能完整通关 |

## 💾 存档系统

- 进度**自动保存**到 `localStorage`（键 `pyquest:save:v3`；**v1 / v2 旧存档自动迁移**，进度完整保留）：
  生命、当前章节、**每章独立进度**（碎片/封印/BOSS 状态）、已答题目与符文抽题记录，
  以及**学习记录**（每次作答：题目、所选项、对错、用时、第几次尝试）、已发现的秘藏、观测日志。
- 只有点了「开始 / 继续冒险」之后才自动存档（标题画面刷新或关页不会再用空进度覆盖存档）；
  读不出来的存档会原样挪到 `pyquest:save:broken`，不会被直接丢掉。
- 标题画面会显示 **「继续冒险 · 第N章」**（按最新通关章节落点）；
  「新的冒险」覆盖存档重新开始（有确认提示）。
- 通关结算中的「重新开始」会清档重置。
- 存档实现：`src/core/save.js`（任何 HUD 数据变化 / 关页 / 切后台时写档）。

## 📖 知识点覆盖（251 题 · 34 个同难度题池 · 对齐 P4A@UCAS 课程）

每块符文石从所属**同难度题池**随机抽题：同池题目 `tier` 一致，
随机但不撞题（同池多块符文不重复、已答过的题不再出现），
同一块符文石在答对之前始终是同一道题。

W4-W11 为**三池式**：每章 `w{N}shard`（野外碎片 ×10 基础）/ `w{N}lair`（巢穴祝福 ×7 进阶）/
`w{N}boss`（BOSS 破盾 ×3 综合）共 20 题，难度 `tier` 11-34 随章递进（W4=11-13 … W8=23-25，
第二部顺延 W9=26-28 … W11=32-34）；`w9shard` 按 W9 提纲 grilling 决议为 11 题。

| 题池 | 题量 | 知识点 |
| --- | --- | --- |
| w1field（W1 村庄 · 碎片） | 13 | 赋值、变量复制、命名、`type`、字符串引号/拼接/重复、`**`、`//` 与 `%`、`/` 返回 float |
| w1lair（W1 地牢 · 祝福） | 17 | print 逗号/f-string、列表索引/负索引/切片/append/pop/`+`/sum/越界、元组不可变/解包/单元素逗号 |
| w1boss（W1 BOSS） | 4 | 列表 append + 索引综合、循环生长、索引覆盖 |
| w2field（W2 森林 · 碎片） | 11 | `def`（填空）、参数传递、`return`、默认参数、局部作用域、多参数、`return` 中断 |
| w2heal（W2 森林 · 祝福） | 5 | 字典存取/更新、`in` 查键、keys() |
| w2lair（W2 洞窟 · 祝福） | 9 | if/elif/else、`!=`、and/or/not、while 递减、while+break、for 遍历、range(起,止) |
| w2boss（W2 BOSS） | 4 | `for + range` 次数、循环累加、字符串累积 |
| w3shard（W3 高原 · 碎片） | 14 | ndarray 索引/shape/ndim、向量化、广播、arange/linspace/zeros、mean/sum、掩膜筛选、argmax、reshape、逐元素乘 |
| w3heal（W3 巢穴 · 祝福） | 9 | plot/scatter/hist/xlabel/savefig、蒙特卡洛估π、random.rand、quad 积分 |
| w3boss（W3 BOSS） | 4 | 平方和、reshape、掩膜+聚合 |
| w4shard（W4 星图塔 · 碎片） | 10 | FITS header 与三类 HDU、`fits.open`/`writeto` overwrite、列 format="D"、500 GB 数据格式选型（HDF5）、healpy 等面积像素/NSIDE、`hp.ma` 掩膜取值、emcee 用途、conda 安装 healpy |
| w4lair（W4 神殿 · 祝福） | 7 | 二进制表列名属性、布尔掩膜选行（NIMG）、EnsembleSampler 召唤、`get_chain(discard/thin/flat)`、均匀先验、`percentile [16,50,84]`、`train_test_split` |
| w4boss（W4 单位术士） | 3 | HDUList append/insert、IMSEP/ZLENS 掩膜列运算、`log_prior` 返回 -inf 时 log_probability |
| w5shard（W5 熔炉 · 碎片） | 10 | 向量化提速、numba `@jit`、KISS 法则/奥卡姆剃刀、GIL 与 multiprocessing、可并行判据、`mpirun` 启动、JAX、热点循环函数调用反模式、quad 一行胜千军 |
| w5lair（W5 深渊 · 祝福） | 7 | `Pool.map`、`comm.Bcast`、复合 Simpson 1-4-1、numba 奇数格循环、ctypes 五步铸剑、OpenMP private 归约、divmod + Scatterv 分发 |
| w5boss（W5 迟缓巨魔） | 3 | Simpson 大 N 拆块、`range(rank, nruns, size)` 任务摊派、八种加速法对比 |
| w6shard（W6 神殿 · 碎片） | 10 | `quad`/`solve_ivp`/`curve_fit`/`interp1d` 各自用途、quad 返 val/err 两件套、odeint 签名陷阱、标量/向量求根两派、`derivative` 有限差分、`np.gradient`、MLE 取对数 |
| w6lair（W6 迷宫 · 祝福） | 7 | brentq、quad `args` 传参、割线法两初值、`curve_fit` bounds、二阶 ODE 降阶、`np.triu` 成对求和、softening 防发散 |
| w6boss（W6 优化牛头怪） | 3 | 广播 + `@` 算两两位置差、dblquad 二重积分、`np.gradient` 双轴梯度 |
| w7shard（W7 圣殿 · 碎片） | 10 | `eig`/`cov`/`fft` 返回值、scipy.linalg 优先、特征方程、fft/ifft 往返、5σ 发现门槛、solve vs inv、matrix_rank/det、随机森林超参 |
| w7lair（W7 回廊 · 祝福） | 7 | PSF=卷积、sklearn fit/predict 流程、FFT 频率轴、convolve2d 边缘提取、混淆矩阵、向量投影 `inner`、`B·inv(A)` 对照修正 |
| w7boss（W7 傅里叶魅影） | 3 | 三纯音 FFT 尖峰、3×3 线性方程组、`inner` vs 逐元素乘 |
| w8shard（W8 深空 · 碎片） | 10 | NFW 轮廓定义与发现、N-body 引力、ρ(Rₛ)=ρ₀/4、外区 r⁻³ 衰减、M(r) 与 ρ 的积分关系、MCMC 要点、逆变换采样、corner 角图、ML→emcee 衔接 |
| w8lair（W8 核心 · 祝福） | 7 | ρ(r) 拟合出 r_s/ρ₀、interp1d 反转 CDF、球面均匀采样 θ/ψ、log-log 拟合、-inf 清洗、自相关时间 τ 与 thin、密度 vs 累积质量两种拟合 |
| w8boss（W8 NFW 幻龙） | 3 | NFW 密度积分→累积质量、M(<R_max) 积分公式、walkers 链 discard/thin 统计 |
| w9shard（W9 外庭 · 碎片） | 11 | 偏态分布均值/中位数/众数、泊松 σ=√N、68-95-99.7、独立误差传播、中心极限定理、似然 vs 概率、χ²/dof、贝叶斯定理、p 值、频率派置信区间、先验选择 |
| w9lair（W9 回廊 · 祝福） | 7 | 泊松涨落数值、误差传播 √(a²+b²)、标准误 σ/√N、`norm.ppf(0.975)`、χ²/dof 数值、16/84 分位 ≈ ±1σ、Beta 后验众数 |
| w9boss（W9 贝叶斯祭司） | 3 | MCMC 收敛诊断与有效样本量、AIC 模型比较、5σ 发现门槛与 look-elsewhere 效应 |
| w10shard（W10 塔底 · 碎片） | 10 | vibe coding 流程、具体 prompt 四要素、LLM「看起来对」≠ 对、API 幻觉、科研代码验证义务、小步迭代、测试先行、上下文给法、样板 vs 关键常数信任策略、人机分工 |
| w10lair（W10 回廊 · 祝福） | 7 | 漏归一化系数、角度/弧度、linspace 边界 off-by-one、锚点测试用例、除零 inf 污染、`math` vs `np` 标量/数组、回归检查 |
| w10boss（W10 幻言魔像） | 3 | vibe coding 五步排序、具体 prompt 改写、旧测试变红的正确处置 |
| w11shard（W11 试炼场 · 碎片） | 10 | 可检验选题、文献调研起点、三类 project 数据来源与流程链（拟合/模拟/ML）、train/val/test、过拟合识别、结果 vs 结论、自选题来源 |
| w11lair（W11 三途 · 祝福） | 7 | `√diag(pcov)` 误差棒、残差结构诊断、PSF 卷积、cutout 尺寸、`random_state` 可复现、类别不平衡指标、解析极限 sanity check |
| w11boss（W11 三途守门人） | 3 | 密度/质量双轨交叉验证、透镜建模残差排查链、跨巡天泛化与分布泄漏 |

## 🏗️ 项目结构

```
src/
├── main.js                  # 游戏入口：按注册表批量注册 22 个章节场景 + 挂载测试接缝 window.__PYQUEST__
├── core/state.js            # 全局状态：G.progress[章] 多章进度 + 传送门解锁条件解析
├── core/save.js             # localStorage 存档 v3：序列化 / 迁移（v1→v2→v3）/ 校验 / 水合四个纯函数 + 配额降级写入
├── core/records.js          # 学习记录：每次作答（对错 / 所选项 / 用时 / 尝试次数）与每题汇总
├── core/mistakes.js         # 错题本视图与复习掌握规则（连续答对 2 次 = 已掌握）
├── core/input.js            # 输入抽象：键盘 + 触控摇杆合并为 8 向移动；交互 / 攻击 / 地图 / 静音为语义动作
├── core/observatory.js      # 观测站纯数学层：NFW 数据与 χ²、频谱调谐、观测日志
├── core/bossMath.js         # BOSS 机制公式（正弦弹道 / NFW 引力 / 后验瞄准权重 / 学习率衰减）
├── core/stations.js         # 第二批观测站纯数学：蒙特卡洛 π / 调度 / 引力积分 / Beta 后验 / 星系特征与 kNN
├── core/realms.js           # Project 秘境进度规则（按序解锁 / 徽章 / HUD）
├── core/tower.js            # 试炼塔规则（解锁 / 错题优先选题 / 楼层规划 / 战绩）
├── core/dojoSim.js          # 代码训练场关卡模拟器（主线程与 Worker 共用）
├── core/dojoPrelude.js      # 训练场的 Python 英雄 API 与中文报错翻译
├── core/pyRuntime.js        # Pyodide 运行时（Worker 管理、超时重建）；core/pyWorker.js 为 Worker 本体
├── core/npmini.js           # NumPy 子集解释器：第三章试炼场的咒语执行器（打印 / 报错与 numpy 1.26 一致，带「选中了哪些格子」的来源信息）
├── core/games.js            # 第三章试炼场进度规则（核心关按序解锁 / 挑战关 / 完成发碎片 / 读档清洗）
├── core/phase.js            # 章内阶段（新来/收集/集齐/门开/通关）：NPC 台词、HUD、世界地图的单一推断来源
├── core/quiz.js             # 答题行为层：随机抽题 pickQuestion + Python 语法高亮
├── core/seam.js             # 测试接缝：window.__PYQUEST__ 只读查询 + 语义动作（E2E 专用）
├── data/
│   ├── chapters.js          # 十一章注册表：周次/地图/对话/胜利文本/BOSS/题池配置（关卡数据核心）
│   ├── maps.js              # 地图构建器：W1/W2 手工地图 + W3-W11 通用生成器（theme 驱动）
│   ├── quizBank.js          # Python 题库（251 题 · 34 个同难度题池）+ 槽位映射（题面权威源，ADR-0001）
│   ├── quizData.js          # 兼容 re-export 枢纽（旧 import 路径，新代码直接用 quizBank / core/quiz）
│   ├── bossMechanics.js     # 11 个 BOSS 招牌机制的种类与参数表（章节配置的 bossMechanic 引用）
│   ├── secrets.js           # 11 个 Python 秘藏彩蛋（REPL 片段 + 讲解）与确定性选址
│   ├── realms.js            # Project 秘境注册表（独立于 CHAPTERS）：每步课题符文引用的题目与理由
│   ├── realmMaps.js         # 秘境大厅 / 外庭 / 圣所地图
│   └── dojoLevels.js        # 代码训练场 7 关（目标 / API / 模板 / 提示 / 参考解 / 多布局）
├── games/                   # 第三章试炼场小游戏：registry.js 登记表 + 每个小游戏一个目录（levels 关卡 / 纯规则 / 界面 / 对拍用例）
│   ├── cards/               # 阵列牌局（battle.js 战斗规则、autoplay.js 自动打法校验平衡）
│   ├── picross/             # 星图拼绘（logic.js 线索与施法规则）
│   ├── signal/              # 外星信号（logic.js 解码判定、art.js 图案）
│   ├── arena/               # 向量风暴（ArenaScene.js 实时场景、rules.js 施法 / 法力规则、arenaMap.js）
│   └── curve/               # 曲线对消（BOSS 护盾，rules.js 残差判定）
├── assets/ts.js             # Tiny Swords 素材清单/加载/动画（素材本体在 assets/TinySwordsFreePack/，未入库）
├── textures/pixelArt.js     # 程序化补充贴图（代码碎片/爱心/传送门/石门等）
├── textures/ground.js       # 整图地面画布（草地 → 水/土路 → 岸沫分层绘制）
├── audio/sfx.js             # WebAudio 程序化 8-bit 音效
├── audio/music.js           # 背景音乐音序器（音频时钟预排音符、交叉淡入、答题压低、切后台暂停）
├── audio/tracks.js          # 16 首程序化曲目（紧凑记谱 + 编译器）与章节曲目映射
├── entities/
│   ├── Player.js            # 玩家：移动/挥剑/受击/死亡（回本章野外重生）
│   ├── Slime.js             # 史莱姆 AI：游荡/追击/掉落（red / crimson 变体）
│   ├── BossSlime.js         # BOSS 之一：护盾/召唤帮手（W1/W3/W5/W7/W9/W11 章）
│   ├── BossSnake.js         # BOSS 之二：体节跟随/断尾/突咬（W2/W4/W6/W8/W10 章）
│   └── bossMechanics.js     # BOSS 招牌机制运行时（按章节配置挂到两种 BOSS 原型上）
└── scenes/
    ├── BootScene.js         # 生成贴图动画 + 标题画面（继续冒险按最新章节落点）
    ├── WorldScene.js        # 世界基类：地图/交互/传送门封印/答题接线（章节驱动）
    ├── ChapterScene.js      # 通用章节场景：FieldScene（野外）+ LairScene（巢穴）+ 工厂
    ├── secrets.js           # 秘藏石碑交互（浮空 / 无限回廊等特效）
    ├── games.js             # 第三章阵列石台：入口、名牌进度、通关结算（发碎片 / 回血 / 破盾）
    ├── RealmScene.js        # Project 秘境大厅 / 外庭 / 圣所场景
    ├── TowerScene.js        # 试炼塔（一个场景反复重启呈现每一层）
    └── DojoScene.js         # 代码训练场（关卡房间 + 动作回放）
ui/                          # DOM 覆盖层：HUD、对话框、答题面板（主线 / 复习两种模式）、结算、
                             # 错题本、观测台（stations/ 为第二批）、秘藏卷轴、BOSS 机制横幅、触控层、音乐开关、
                             # 训练场编辑器面板、试炼塔结算页、小游戏面板外壳 GamePanel 与咒语输入行 SpellInput
scripts/
├── smoke.mjs                # 无头冒烟测试（贴图/全部章节地图/题库/题池/抽题校验）
├── verify-quiz.mjs          # 题库自动校验（用本机 python 执行输出确定的题目，比对 stdout）
├── verify-secrets.mjs       # 秘藏彩蛋里展示的 Python 输出逐条用真 python 复现核对
├── verify-dojo.mjs          # 训练场每关参考解在全部布局上用 CPython 实跑通关、初始模板不能通关
├── verify-npmini.mjs        # NumPy 子集解释器与真 NumPy 1.26 逐字对拍（含各小游戏参考解）
├── verify-game-<id>.mjs     # 第三章各试炼场：参考解能过关、常见错解不过、判定规则与平衡（cards / picross / signal / arena / curve）
├── fixtures/                # 真实的 v1 / v2 存档样本（迁移测试用）
├── gen-ts-stubs.mjs         # 无素材环境（CI）生成 Tiny Swords 纯色占位图，让 E2E 可跑
├── run-e2e.mjs              # E2E 总入口（npm run test:e2e）：复用或临时启动 dev server，逐章跑并汇总
├── e2e/lib/runner.mjs       # 章节 E2E 共享运行器：各章脚本只声明 labels + steps
├── e2e.mjs                  # Playwright E2E：第一章全流程 + 存档
├── e2e-ch2.mjs              # 第二章 E2E（森林/洞窟/巨蟒/进入第三章/读档续玩）
├── e2e-ch3.mjs              # 第三章 E2E（四座试炼场 → 开门 → 曲线对消破盾 → 魔君 → 衔接第四章 + 读档续玩）
├── e2e-ch4.mjs              # 第四章 E2E（星图塔/FITS 符文/单位术士/衔接第五章）
├── e2e-ch5.mjs              # 第五章 E2E（加速熔炉/深渊符文/迟缓巨魔/衔接第六章）
├── e2e-ch6.mjs              # 第六章 E2E（数值神殿/迷宫符文/优化牛头怪/衔接第七章）
├── e2e-ch7.mjs              # 第七章 E2E（信号圣殿/回廊符文/傅里叶魅影/衔接第八章）
├── e2e-ch8.mjs              # 第八章 E2E（深空晕环/核心符文/NFW 幻龙/衔接第二部第九章）
├── e2e-ch9.mjs              # 第九章 E2E（统计圣所/后验回廊/贝叶斯祭司/衔接第十章）
├── e2e-ch10.mjs             # 第十章 E2E（灵思之塔/验证回廊/幻言魔像/衔接第十一章）
├── e2e-ch11.mjs             # 第十一章 E2E（毕业试炼/三途之门/三途守门人/全部通关）
└── e2e-<功能>.mjs           # 功能 E2E（自动发现）：boss-mechanics / observatory / stations / secrets / review / music /
                             # mobile / realms / tower / dojo / game-cards / game-picross / game-signal / game-arena / game-curve
```

## 🎨 画面技术（Tiny Swords 素材 + 程序化补充）

- **主素材**：[Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords)（Pixel Frog · Free Pack，
  本地 `assets/TinySwordsFreePack/`，**许可证禁止再分发 → .gitignore 排除，需自行下载**）——
  角色全套（蓝勇士/僧侣/红小兵/黑勇士/紫勇士）、tileset 地形、树/灌木/云、
  尘土/火焰特效、建筑（修道院/塔）
- **TS 坐标系**：逻辑 tile 64px（相机 1x、单位帧 192×192 原尺寸 1:1 渲染，像素完美）
- 角色映射：勇者=蓝军勇士（待机/奔跑/挥剑动画）、长老=蓝军僧侣、村庄小怪=红小兵、
    森林小怪=黑勇士、第一章 BOSS=紫勇士巨型化+金徽（循环之王）、巨蟒=黑勇士头+黑小兵体节
- 符文石待解状态仅做 ±0.7% 微缩放呼吸（视觉跳动 < 1px），不干扰辨识
- **像素完美渲染**：16px tile × 相机 4x 整数放大，`pixelArt: true`，无插值模糊
- **地形拼接**：`ground.js` 把 tileset 拼成整图画布——野外只取图集无缝中心格平铺
  （草地/土路连续无描边缝，土路连接边贴死、仅外角圆角），水面用官方水底色
  + 沿陆地一侧的连续岸沫条，地牢/洞窟用程序化深色石砖
- **程序化补充**（`textures/pixelArt.js`）：代码碎片/爱心/传送门/水晶/蘑菇/
  石门/火炬等游戏专属元素，与素材同风格（平涂 + `#3f2631` 深紫描边）
- **碰撞与渲染分离**：碰撞由不可见静态矩形承担（`WorldScene.tileBodies`）

## 🔧 如何扩展

- **加一章**：在 `src/data/chapters.js` 的 `CHAPTERS` 里加一个对象（标题/世界名/BOSS/对话/victory 文案/
  theme 主题/题池名），再在 `src/data/quizBank.js` 建对应题池——地图/场景/传送门全部自动生成注册。
- **充实 W4-W11 题量**：在 `quizBank.js` 的 `QUESTIONS` 里加题（标 `tier` 与所属池一致），
  加进对应 `POOLS`（如 `w4shard` / `w4lair` / `w4boss`）即可，符文槽会自动抽到。
- **改地图主题**：章节配置的 `theme` 字段（palette 草原/地牢、seed、尺寸、怪物密度、氛围色）。
- **改 W1/W2 手工地图**：`src/data/maps.js` 是纯代码构建器，改数字即可挪动池塘、道路、道具。

## 🧪 测试

一条命令跑完全部验证（本地与 CI 相同）：

```bash
npm run check                # lint → test → build → test:e2e
```

也可以分开跑：

```bash
npm run lint                 # ESLint（flat config，仅 recommended 规则，不管格式）
npm test                     # smoke（地图 / 题库 / 存档迁移 / 学习记录 / 各玩法数据）+ verify-quiz / verify-secrets / verify-dojo（python 实跑核对）
                             # + verify-npmini（咒语解释器与真 NumPy 对拍）+ verify-game-*（第三章试炼场关卡）
npm run test:e2e             # 全部章节 E2E：5173 上已有 dev server 就复用，没有就临时起一个、跑完关掉
npm run test:e2e -- 9 10 11  # 只跑指定章节
npm run test:e2e -- review music  # 只跑指定功能（scripts/e2e-<功能>.mjs 自动发现）
npm run stubs                # 没有 Tiny Swords 素材时先生成占位图（检测到真实素材包会跳过）
```

- verify-quiz 需要本机 python 带 numpy / scipy / astropy / scikit-learn
  （CI 按 `scripts/requirements-verify.txt` 安装，numpy 锁 1.x 与课程环境一致）
- CI（`.github/workflows/ci.yml`）：每次 push / PR 在 Ubuntu 上生成占位素材后跑 `lint`、`test`、
  `build`、`test:e2e`，失败时上传 E2E 截图

单独跑某一章的 E2E（需先 `npm run dev`）：

```bash
node scripts/e2e.mjs         # E2E：第一章（答题/开门/BOSS/进第二章/存档）
node scripts/e2e-ch2.mjs     # E2E：第二章（森林/洞窟/巨蟒/进第三章/读档续玩）
node scripts/e2e-ch3.mjs     # E2E：第三章样板章（四座试炼场/曲线对消/魔君/衔接第四章/读档）
node scripts/e2e-ch4.mjs     # E2E：第四章（星图塔/FITS 符文/单位术士/衔接第五章）
node scripts/e2e-ch5.mjs     # E2E：第五章（加速熔炉/深渊符文/迟缓巨魔/衔接第六章）
node scripts/e2e-ch6.mjs     # E2E：第六章（数值神殿/迷宫符文/优化牛头怪/衔接第七章）
node scripts/e2e-ch7.mjs     # E2E：第七章（信号圣殿/回廊符文/傅里叶魅影/衔接第八章）
node scripts/e2e-ch8.mjs     # E2E：第八章（深空晕环/核心符文/NFW 幻龙/衔接第九章）
node scripts/e2e-ch9.mjs     # E2E：第九章（统计圣所/后验回廊/贝叶斯祭司/衔接第十章）
node scripts/e2e-ch10.mjs    # E2E：第十章（灵思之塔/验证回廊/幻言魔像/衔接第十一章）
node scripts/e2e-ch11.mjs    # E2E：第十一章（毕业试炼/三途之门/三途守门人/全部通关）
```

## 🗺️ 路线图（对齐 P4A@UCAS 64 学时课程）

- [x] ~~八章节架构：数据驱动注册表 + 通用关卡生成器 + v2 多章存档~~ ✅
- [x] ~~W1/W2 内容按周次重对齐（地牢=列表/元组，洞窟=控制流）~~ ✅
- [x] ~~第三章 · 科学计算高原（NumPy/Matplotlib/蒙特卡洛，完整样板章）~~ ✅
- [x] ~~第三章改造为「NumPy 本身就是玩法」：四座试炼场 + 曲线对消 BOSS，必经路径不再有四选一~~ ✅（见「第三章样板」）
- [ ] 其余章节按同样思路改造（先试玩第三章确认方向）
- [x] ~~W4-W8 注册为可玩关卡（传送门链 + 起步题池）~~ ✅
- [x] ~~W4-W8 题量充实 · 第一阶段（每章 20 题：shard×10 基础 / lair×7 进阶 / boss×3 综合，tier 11-25）~~ ✅
- [ ] W4-W8 题量进一步充实（可选扩展至每章 40-60 题：FITS 实操、emcee 漫步、NFW 拟合数值题）
- [x] ~~Pyodide 真实代码执行~~ ✅ 第一步：代码训练场（纯 Python，W1-W2 概念）；W6-8 跑 numpy/scipy 判分仍待做（见 `.scratch/pyodide-sandbox/`）
- [x] ~~课程 Project 作为通关后隐藏关卡~~ ✅ 已做 4 个（P1 / P2 / P4 / P5+7，名为「Project 秘境」）；P3 / P6 / P8 待做
- [x] ~~移动端虚拟摇杆~~ ✅（触控层 + 答题面板触控适配）
- [ ] 难度曲线（爱心上限/商店金币）——规格见 `.scratch/difficulty-economy/`

### 第二部（64 学时扩展，详见 `docs/part2-plan.md`）

- [x] ~~第九章 · 统计圣所（天文学中的统计学基础，到 MCMC 后验分布为止）~~ ✅
- [x] ~~第十章 · 灵思之塔（vibe coding 工具方法论，四选一符文落地）~~ ✅
- [x] ~~第十一章 · 毕业试炼（project-driven study 实战收尾）~~ ✅
- [ ] 第十章对话式编程 UI（模拟 prompt → 迭代 → 验证）

### 已上线的新玩法与后续规划

- [x] ~~BOSS 招牌机制、观测站小游戏、Python 秘藏、错题本 + 学习记录、程序化背景音乐、移动端触控~~ ✅（见「新玩法」）
- [x] ~~新关卡：Project 秘境 ×4、无尽试炼塔、代码训练场（7 关）；观测站扩到 7 座~~ ✅（见「新关卡」）
- 完整 backlog（33 个 effort · 193 张工单，含 Pyodide 代码沙盒、代码拼图、课堂投屏模式、学习报告、
  星系分类台、引力沙盒、写代码驱动勇者等）与设计依据见 [`.scratch/README.md`](.scratch/README.md)、
  [`.scratch/INSPIRATION.md`](.scratch/INSPIRATION.md)

## 📄 许可证

- **本项目代码**：[MIT License](LICENSE)
- **`assets/cc0/` 素材**：CC0 公共领域（0x72 / Kenney），可自由商用与再分发
  （当前版本未加载，留作第二部备用素材）
- **Tiny Swords 素材**：仅本地开发使用，许可证禁止再分发（未入库，需自行下载）
