# P4A@UCAS 课程素材地图

> 源目录：`/Users/uranus/Desktop/P4A@UCAS`（本地，不入库）。
> 本文记录素材位置与用途，供充实题库 / 毕业试炼关卡时引用。
> 建立于 2026-10-21（素材扫描会话）。

## 1. 权威源：P4A@UCAS-latest/（2026 春更新，出题以此为准）

路径：`/Users/uranus/Desktop/P4A@UCAS/P4A@UCAS-latest/`

| 材料 | 路径 | 对应游戏章节 | 备注 |
| --- | --- | --- | --- |
| Week1 讲义 | `Notebooks/P4A_Week1.ipynb` | 第一章 | Python 基础 |
| Week2 讲义 | `Notebooks/P4A_Week2.ipynb` | 第二章 | 函数/控制流 |
| Week3 讲义 | `Notebooks/P4A_Week3.ipynb` | 第三章 | NumPy/Matplotlib |
| Week4 讲义 | `Notebooks/P4A_Week4/P4A_Week4.ipynb` | 第四章 · 天文包 | FITS/Astropy/healpy/sklearn；同目录有 HorseHead.fits、qso_mock.fits、wmap_*.fits、MNIST 数据 |
| Week5 讲义 | `Notebooks/P4A_Week5/P4A_Week5.ipynb` | 第五章 · 加速 | 同目录 examples_cython / examples_multiprocessing / examples_mpi4py / examples_ctypes 完整可跑示例 |
| Week6 讲义 | `Notebooks/P4A_Week6.ipynb` | 第六章 · 数值方法 | quad/solve_ivp/curve_fit/brentq/interp1d |
| Week7 讲义 | `Notebooks/P4A_Week7.ipynb` | 第七章 · 信号 | eig/cov/FFT/卷积/sklearn |
| Week8 讲义 | `Notebooks/P4A_Week8.ipynb` | 第八章 · 暗物质 | NFW/N-body/M₂₀₀（17.5MB，含大量图） |
| emcee 练习 | `Notebooks/emcee_line_fitting_for_students.ipynb` | 第四章（emcee 相关题） | 学生练习版 |
| 教材 | `Books/textbook.pdf` | — | |
| 主 slides | `Slides/Python4Astronomy@UCAS.pptx` | — | 课程总述 deck |

## 2. 八个课程 Project（路线图「毕业试炼」隐藏关卡的素材）

路径：`P4A@UCAS-latest/Projects/`

| Project | 主题 | 与章节关联 |
| --- | --- | --- |
| Project-1 | Simulating Double Einstein Rings for CSST（双爱因斯坦环模拟） | 强透镜 |
| Project-2 | Modeling Galaxy-Galaxy Strong Lensing System | 强透镜建模 |
| Project-3 | Cutting Out Galaxy Images and Measuring Parameters | 图像截取/测参 |
| Project-4 | Reconstructing Dark Matter Halo Density Profile（emcee NFW 拟合） | **第八章直接相关** |
| Project-5 | Classifying Galaxy Morphology with ML（ResNet） | 深度学习 |
| Project-6 | Measuring Galaxy Parameters with ML（椭率测量） | 深度学习 |
| Project-7 | Classifying Objects Using Spectrum with ML | 光谱分类 |
| Project-8 | Self-Designed Project | 自选 |

## 3. 历史存档（比对出题风格 / 真题参考，非权威源）

顶层 `/Users/uranus/Desktop/P4A@UCAS/` 下：

- `P4A@UCAS-2024-Spring` / `P4A@UCAS-2025-Spring` / `P4A@UCAS-2026-SPRING`：各学期课程包
- `P4A@UCAS-*-作业收集`（2024/2025/2026）+ `P4A@UCAS2023Fall期末大作业收集`：**作业与期末真题**，可提炼考题风格
- `2023—2024学年(秋)第一学期-B0312012Y.xls` + `课程教学总结-B0312012Y.doc`：教务记录
- 大体积 zip（`【Batch download】*`、`PythonInAstronomy.zip`、`filesForStudents*.zip`、`week4/5.zip`）：批量归档，内容与上述目录基本重复
- 散落的 2024 版 Week1-8 notebook：旧版本，**以 `P4A@UCAS-latest/` 为准**

## 4. 使用约定

1. **出题对齐**：W4-W8 出题提纲与题目内容一律以 `P4A@UCAS-latest/Notebooks/` 的 2026 版讲义为准。
2. **剥离版缓存**：讲义的「仅 markdown+code」剥离版（去 base64 图片输出）缓存在
   `/private/var/folders/7z/hdr_2hpx1td2cw2cxslg7d1w0000gs/T/opencode/p4a-notes/week{4..8}.md`，
   临时目录，会话结束可能失效；重建命令见本文 git 历史（预处理脚本用 python3 提取 ipynb cells）。
3. **数据文件**：Week4 目录的 FITS 文件（HorseHead/test0/qso_mock/wmap）可在自动校验脚本中作为真实读取素材（本机 anaconda3 有 astropy 7.2 / numpy 1.26 / scipy 1.15 / sklearn 1.9）。
4. **真题风格**：作业/期末收集目录可用于校准难度与题型，但内容优先级低于 2026 版讲义。
