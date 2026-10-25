# 06: scenes / entities / textures / audio 开启类型检查

Status: ready-for-agent
Type: task
Blocked by: 05

## 要做什么

Phaser 相关代码被纳入类型检查，使用 Phaser 自带的类型声明。场景基类上的可交互对象列表、玩家、BOSS 等实体字段都有类型，调用 Phaser API 拼错方法名或传错参数会被发现。

Phaser 动态属性（如在精灵上临时挂的业务字段）允许宽松标注，但必须集中声明，不能散落在各处用 any 绕过。

## 验收标准

- [ ] scenes、entities、textures、audio 目录在检查范围内，零报错
- [ ] 实体上挂的业务字段（如 BOSS 标记、死亡标记）集中声明
- [ ] 本批「期望出错」类忽略注释不超过 10 处，每处都有原因
- [ ] 本批没有用户可见的行为变化（11 章 E2E 通过）
- [ ] npm run check 全绿

## Comments
