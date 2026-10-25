# 06: 其余 Python 彩蛋（按 grilling 确认的清单）

Status: needs-info
Type: task
Blocked by: 05

## 要做什么

按 grilling 确认的清单与文案实现其余彩蛋，复用 05 建立的彩蛋机制：

- `import antigravity` 羽毛（勇者浮空 3 秒，碰撞不变；减少动态效果时改为静态浮字）
- `__main__` 之门（从本章正门进入时开、经世界地图快速传送进入时不开；需核实快速传送使用的出生点 key）
- `print("Hello, World!")` 告示牌
- `while True:` 史莱姆（无伤害，挥剑后浮字「break」并消失；不计入小怪掉落）
- `IndentationError` 歪碑（两段交互）
- `0.1 + 0.2` 天平（对话解释浮点误差与 `np.isclose`）
- `random_state=42` 石骰（新游戏后掷出序列确定）

## 验收标准

- [ ] 每个彩蛋都有一条 E2E `easterEgg` 步骤或 smoke 断言覆盖其触发与记录（`__main__` 之门两种进入方式都要覆盖）
- [ ] 彩蛋不改变任何主线进度字段（E2E 断言触发前后 progress 快照相同）
- [ ] 无伤害彩蛋史莱姆不掉落爱心、不计入清怪接缝的统计
- [ ] `npm run check` 全绿

## Comments
