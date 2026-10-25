# 02: 关卡模拟器纯函数 + 关卡数据契约（不依赖 Python）

Status: ready-for-agent
Type: task
Blocked by: None (can start immediately)

## 要做什么

建立训练场的确定性核心（JS 纯函数，主线程与 Worker 共用同一模块），不含界面、不依赖 Pyodide：

- 关卡数据契约：网格（地面 / 墙 / 水 / 陷阱 / 符文石 / 碎片 / 史莱姆）、起点与朝向、目标（到达 / 收集全部碎片 / 击败全部史莱姆 / 组合）、可用 API 白名单、步数上限、起始代码、分级提示、参考解（Python 文本）、参考动作列表；
- `apply(state, action)` 单步结算（撞墙原地不动但计步、踩陷阱失败、走进水失败、攻击前方史莱姆、拾取碎片）；
- `look(state)` 返回前方格子类型；
- `simulate(level, actions)` → `{ frames, result, reason, steps }`；
- 两个样板关卡数据（顺序执行、for+range）用于测试；完整关卡清单待 01 号。

## 验收标准

- [ ] smoke：两个样板关卡的参考动作列表判定过关；空动作列表判定不过关并给出原因
- [ ] smoke：撞墙、陷阱、水、步数上限、目标组合各有用例
- [ ] smoke：关卡数据完整性校验（白名单、提示、参考解、参考动作齐全；起点不在墙内；目标可达）
- [ ] 同输入同输出（确定性）
- [ ] `npm run check` 全绿

## Comments
