# 03: 决策：cc0 备用素材怎么处理

Status: ready-for-human
Type: grilling
Blocked by: None (can start immediately)

## 要做什么

维护者决定 cc0 备用素材（约 970 KB）的去留，以便 04 把它从构建产物中移除。

现状：构建配置把整个素材目录设为公共目录，Vite 会原样复制它。cc0 素材在源码和页面中没有任何引用，README 写着「当前版本未加载，留作第二部备用素材」，但第二部三章已用通用生成器落地，并未使用这些素材。

候选：

- **A（推荐）**：移到仓库内一个不会被构建复制的「未发布备用素材」目录，保留文件和许可证说明，以后需要时再接入。
- **B**：直接删除，需要时再从 0x72 / Kenney 官方重新获取。

## 验收标准

- [ ] 维护者在 Comments 记录选择（A 或 B）及理由
- [ ] 把 04 的 Status 改为 ready-for-agent

## Comments
