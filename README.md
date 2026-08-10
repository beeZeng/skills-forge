# Nexus Desktop

面向 AI Agent 的跨平台能力中枢（Electron + React + TypeScript）。产品名：**Nexus**。

## 启动

```bash
cd skills-forge
npm install
npm run dev
```

## 能力

- **发现技能**：搜索、筛选、收藏、安装/更新（目录来自真实技能源）
- **Skill 详情**：居中弹窗 + Markdown 预览 + Agent 同步开关
- **我的技能**：新建 MD、导入目录/zip/单文件 md
- **发布**：上传 zip 自动规范化，或发布本地新建/导入 Skill 到盘古 Hub
- **账号**：SkillHub 登录（可配置 Hub URL），会话 48 小时，登录后自动连接盘古
- **任务中心**：安装/同步/发布进度
- **设置**：技能源、智能体路径、存储、高级、[操作说明](src/pages/Settings/GuidePage.tsx)

## 结构

```
electron/main     Main Process + IPC
electron/preload  contextBridge API
src/              UI / Zustand / services
```

`skillhub/` 原始仓库保持独立，本目录为桌面客户端 Nexus。

## 使用说明

应用内打开：**设置 → 使用指南**（`#/settings/guide`），含账号、盘古 Hub、发布向导、Tunnel 排错与近期更新摘要。
