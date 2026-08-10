# Nexus Desktop

面向 AI Agent 的跨平台能力中枢（Electron + React + TypeScript）。产品名：**Nexus**。

## 启动

```bash
cd skill-mesh
npm install
npm run dev
```

## 能力

- 发现技能：搜索、筛选、收藏、安装/更新（目录来自真实技能源）
- 右侧详情 Drawer + Agent 同步 Toggle
- 已安装 / 新建导入 / 发布向导
- 任务中心（进度、失败重试）
- 设置：技能源、智能体扫描、存储、高级、操作说明

## 结构

```
electron/main     Main Process + IPC
electron/preload  contextBridge API
src/              UI / Zustand / services
```

`skillhub/` 原始仓库保持独立，本目录为桌面客户端 Nexus。
