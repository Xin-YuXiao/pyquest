# 设计灵感：别的教学游戏 / 教学研究给 PyQuest 的启发

> 2026-10-25 调研整理。目的：给 backlog 里的新玩法找「有依据的」出处，同时标明证据强弱——
> 教学游戏领域里厂商数据和博客说法很多，下面把同行评审研究和二手说法分开写。
> 每条都落到具体的 effort（`.scratch/<slug>/`）。

## 一、证据较强、直接可用的教学设计

| 来源 | 核心做法 | 证据强度 | 落到 PyQuest |
| --- | --- | --- | --- |
| **Parsons problems**（Ericson 等） | 把正确代码的行打乱，学生重新排序 | 多项研究：比从零写更快、学习收益相当、更有参与感；但多为单校研究，多校研究进行中 | `parsons-runes` 代码拼图符文：直接用题库里已对齐讲义、verify-quiz 实跑过的代码做拼图，不用编新题 |
| **PRIMM**（Sentance / Waite 等） | 预测 → 运行 → 调查 → 修改 → 创作 | 2019 年 13 校 493 名学生对照研究，结果偏向 PRIMM | 现有四选一 = 「预测」；`code-trace-replay` 补上「运行 + 调查」，`debug-runes` / `code-the-hero` 补「修改 + 创作」 |
| **Gidget**（UW，debugging-first） | 目标写成测试用例，玩家检查 / 修改 / 测试既有代码 | 对照研究：学习收益与 Codecademy 教程相当，用时约一半 | `debug-runes` 找 bug 符文；与第十章「幻言魔像」（AI 写的错代码）天然契合 |
| **Peer Instruction**（Mazur） | 独立投票 → 同伴讨论 → 再投票 | 物理教育经典方法；课堂例子 29% → 62%；单课程案例增益约翻倍，也有不明显的案例 | `classroom-mode` 课堂投屏模式（两轮投票，助教录入票数，无需后端） |
| **Kahoot!** | 课堂实时竞答 | Wang & Tahir 2020 综述 93 项研究，总体正面；**竞争性可能增加焦虑** | 吸收其节奏感，但不做个人排行榜 → `classroom-mode` 的「全班 BOSS 战」 |
| **间隔重复 / 提取练习** | 隔一段时间再考、主动回忆 | 2024 年 9 门 STEM 入门课研究：间隔效应只在 2 门显著，**泛化性不确定**；提取练习与考试成绩正相关（相关性） | `mistake-review` 错题本复习、`challenge-modes` 每日星图——定位为「有帮助的练习机会」，不做激进的打卡压力 |
| **渐隐例题**（faded worked examples） | 先给完整例题，再逐步留空让学生补 | 认知负荷理论支撑充分；编程领域实证较少；对已有基础的学生可能反效果（expertise reversal） | `mistake-review` 复习时附「分步解析」；`placement-test` 让有基础的学生跳过入门章，避免反效果 |

## 二、优秀教育产品的设计（证据以产品实践为主）

| 产品 | 值得借鉴 | 要避开的坑 | 落到 PyQuest |
| --- | --- | --- | --- |
| **CodeCombat** | 写真 Python 控制角色过关；教师面板能看每个学生的代码；关卡编辑器 | 收费墙、学生数据隐私协议问题 | `code-the-hero`（依赖 Pyodide 沙盒）；`custom-quiz-packs` 让助教自制题包；`learning-report` 班级汇总 |
| **The Farmer Was Replaced** | Python 风格语言自动化无人机；概念一个一个引入；按下运行看结果的即时反馈 | 不手把手，纯新手会卡；语言不是真 Python | `code-the-hero` 用**真 Python**（Pyodide），关卡按 W1-W2 概念逐级引入，并给提示 |
| **Duolingo** | 摸底测试定位起点；学习路径；错题回顾；连续打卡 | 连胜靠「损失厌恶」驱动，没有对照研究证明连胜本身有益 | `placement-test` 摸底跳章；打卡只做温和的鼓励，不惩罚断签 |
| **Classcraft** | 把课堂包装成角色扮演，BOSS 战做形成性评价；创始人**刻意不做排行榜**（排行榜只激励中间段学生） | 无障碍测试表现差 | `classroom-mode` 全班 BOSS 战；全项目原则：不做个人排行榜 |
| **Zachtronics（Opus Magnum）** | 通关后用**直方图**显示「你的解在所有人里的位置」，激励自我优化而非排名 | 分箱可能误导 | `challenge-modes` / `code-the-hero` 显示个人最佳；若有助教汇总的班级数据，显示匿名分布直方图而非排行榜 |
| **Python Tutor** | 逐步执行可视化 | 只展示、不解释，新手看不懂（notional machine 批评） | `code-trace-replay` 每一步配一句中文解释标签 |
| **Galaxy Zoo / Zooniverse** | 真实天文数据、真实科学；导论天文课分类 22 个星系再与志愿者对比 | 需要老师帮学生建立与自己的关联 | `galaxy-classifier` 星系分类台 → 训练分类器 → 混淆矩阵（衔接 W7、Project-5/7） |
| **Universe Sandbox** | 引力沙盒：改参数看轨道变化，用模拟数据支撑论证 | 预设场景玩完后兴趣下降 → 需要挑战关卡 | `gravity-sandbox` 引力沙盒（衔接 W6 softening、W8 N-body），配挑战关卡 |

## 三、贯穿全项目的设计原则（从上面提炼）

1. **先预测、再验证**：每个新玩法都尽量让学生先给出自己的判断，再看真实结果（PRIMM、Peer Instruction、拟合台）。
2. **复用已校验的内容做新玩法**：拼图、回放、找 bug 都从题库里 verify-quiz 实跑过的代码派生，守住 ADR-0001。
3. **不做个人排行榜**：用个人最佳与匿名分布代替（Classcraft、Zachtronics、Kahoot 的焦虑问题）。
4. **温和的重复练习**：错题本和每日题鼓励回来练，但不靠惩罚断签驱动（间隔效应在 STEM 的证据并不一边倒）。
5. **照顾混合水平的班级**：摸底跳章给有基础的学生，提示与分步解析给新手（expertise reversal）。
6. **课堂可用**：助教不需要服务器、不需要学生设备也能在课上用（投屏模式、题包、报告汇总都离线）。

## 来源

- Parsons problems：[ITiCSE 2023 多校研究](https://strathprints.strath.ac.uk/86100/)；[Parsons Problems and Beyond 系统综述](https://acris.aalto.fi/ws/portalfiles/portal/131069230/Parsons_Problems_and_Beyond_-_Systematic_Literature_Review_and_Empirical_Study_Designs_.pdf)；[Ericson NSF 论文列表](https://par.nsf.gov/search/author:%22Ericson,%20Barbara%20Jane%22)
- PRIMM：[Teaching computer programming with PRIMM（QMUL）](https://qmro.qmul.ac.uk/xmlui/handle/123456789/57800)；[Raspberry Pi 基金会 PRIMM 摘要](https://static.raspberrypi.org/files/curriculum/quickreads/11-Pedagogy_Summary_PRIMM_V4_2023.pdf)
- Gidget：[设计原则论文](https://faculty.washington.edu/ajko/papers/Lee2014GidgetPrinciples.pdf)；[博士论文](https://faculty.washington.edu/ajko/dissertations/Lee2015Dissertation.pdf)；[Teaching and Engaging with Debugging Puzzles](https://digital.lib.washington.edu/researchworks/items/f190308a-2115-4407-84d7-9043055d495c/full)
- Peer Instruction：[JHU：Leveraging Peer Instruction](https://ii.library.jhu.edu/2013/09/27/leveraging-peer-instruction)；[Columbia：Newton, One-on-One](https://columbia.edu/cu/gsapp/BT/RESEARCH/mazur.html)（主文献 Crouch & Mazur 2001, *Am. J. Phys.*，引用前需核对原文）
- Kahoot!：[Wang & Tahir 2020 文献综述](https://research.gold.ac.uk/id/eprint/39435)；[Kahoot 研究页（厂商）](https://kahoot.com/research-articles/)
- 游戏化 / 间隔重复：[游戏化 meta 分析（PMC10591086）](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10591086/)；[STEM 间隔提取练习研究（IJ STEM Ed 2024）](https://doaj.org/article/13125faeb142423695a0e121ef8777ef)；[游戏化测试与考试成绩（IRRODL 2019）](https://www.erudit.org/en/journals/irrodl/2019-v20-n2-irrodl04703/1061329ar/)
- 渐隐例题：[ICER 2007 提案](https://unpaywall.org/10.1145%2F1288580.1288594)；[ASU 渐隐与自适应反馈研究](https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Stat_Adapt_Fad_JEE06.pdf)；[算法教学渐隐例题研究](https://openaccess.hacettepe.edu.tr/handle/11655/5961)
- Python Tutor / notional machine：[CACM 评论](https://cacm.acm.org/?p=105913)；[UIUC 硕士论文](https://www.ideals.illinois.edu/items/131536)；[Codio（厂商）](https://www.codio.com/blog/python-tutor-codio-visualizer)
- CodeCombat：[Common Sense Education 评测](https://www.commonsense.org/education/reviews/codecombat)；[TeachersFirst](https://teachersfirst.org/single.cfm?id=21956)
- The Farmer Was Replaced：[80.lv](https://80.lv/articles/this-game-teaches-you-to-code-by-automating-a-farm)；[GamingOnLinux 评测](https://www.gamingonlinux.com/2025/10/the-farmer-was-replaced-is-a-satisfying-way-to-learn-a-little-programming-with-automation/page=1/)；[Thinky Games](https://thinkygames.com/games/the-farmer-was-replaced/)
- Duolingo：[官方：Duolingo 101](https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo)；[官方：间隔重复](https://blog.duolingo.com/spaced-repetition-for-learning)；[UX Planet 产品分析](https://uxplanet.org/analyzing-duolingo-from-product-design-perspective-after-400-days-of-non-stop-practice-c4d4809bdb37)
- Classcraft：[Getting Smart](https://www.gettingsmart.com/2014/03/classcraft-gamifies-classroom-culture/)；[Common Sense Education](https://www.commonsense.org/education/website/classcraft)；[Tech & Learning](https://www.techlearning.com/resources/classcraft)
- Zachtronics：[Opus Magnum（Wikipedia）](https://en.wikipedia.org/wiki/Opus_Magnum)；[直方图与全球纪录](https://biggieblog.com/tracking-the-global-opus-magnum-records/)
- Galaxy Zoo：[Galaxy Zoo in Astronomy 101](https://www.zooniverse.org/projects/zooniverse/galaxy-zoo-in-astronomy-101)；[中学课堂实践](https://blog.zooniverse.org/2014/01/29/thoughts-from-the-classroom-thinking-of-using-galaxy-zoo-in-your-middle-school-classroom-do-it/)；[Royal Museums Greenwich 教案](https://www.rmg.co.uk/schools-communities/teacher-resources/galaxy-statistics)
- Universe Sandbox：[Common Sense Education](https://www.commonsense.org/education/game/universe-sandbox)；[万有引力课堂研究（Eureka）](https://revistas.uca.es/index.php/eureka/article/download/11796/13221/71099)
