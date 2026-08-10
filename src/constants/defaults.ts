import type { AgentInstallation, SkillSource } from '@/types'

/** Built-in public registries + internal offline home for created/imported skills. */
export const DEFAULT_SOURCES: SkillSource[] = [
  {
    id: 'clawhub',
    name: 'ClawHub',
    type: 'clawhub',
    registryUrl: 'https://clawhub.ai',
    enabled: true,
    status: 'disconnected',
  },
  {
    id: 'xfyun-skillhub',
    name: '讯飞 SkillHub',
    type: 'custom',
    registryUrl: 'https://skill.xfyun.cn',
    enabled: true,
    status: 'disconnected',
  },
  {
    id: 'skillsmp',
    name: 'SkillsMP',
    type: 'skillsmp',
    registryUrl: 'https://skillsmp.com',
    enabled: true,
    status: 'disconnected',
  },
  {
    id: 'palebluedot',
    name: 'Pale Blue Dot',
    type: 'palebluedot',
    registryUrl: 'https://skills.palebluedot.live',
    enabled: true,
    status: 'disconnected',
  },
  {
    id: 'local',
    name: '本地离线',
    type: 'offline',
    enabled: true,
    status: 'connected',
  },
]

/** Agent templates; Electron scan overwrites `installed` / paths. */
export const DEFAULT_AGENTS: AgentInstallation[] = [
  {
    id: 'cursor',
    type: 'cursor',
    name: 'Cursor',
    installed: false,
    skillPath: '~/.cursor/skills',
    defaultSkillPath: '~/.cursor/skills',
  },
  {
    id: 'claude-code',
    type: 'claude-code',
    name: 'Claude Code',
    installed: false,
    skillPath: '~/.claude/skills',
    defaultSkillPath: '~/.claude/skills',
  },
  {
    id: 'piagent',
    type: 'piagent',
    name: 'PiAgent',
    installed: false,
    skillPath: '~/.pi/skills',
    defaultSkillPath: '~/.pi/skills',
  },
  {
    id: 'codex',
    type: 'codex',
    name: 'Codex',
    installed: false,
    skillPath: '~/.codex/skills',
    defaultSkillPath: '~/.codex/skills',
  },
  {
    id: 'qoder',
    type: 'qoder',
    name: 'Qoder',
    installed: false,
    skillPath: '~/.qoder/skills',
    defaultSkillPath: '~/.qoder/skills',
  },
  {
    id: 'trae',
    type: 'trae',
    name: 'Trae',
    installed: false,
    skillPath: '~/.trae/skills',
    defaultSkillPath: '~/.trae/skills',
  },
  {
    id: 'opencode',
    type: 'opencode',
    name: 'OpenCode',
    installed: false,
    skillPath: '~/.opencode/skills',
    defaultSkillPath: '~/.opencode/skills',
  },
]

export const CATEGORY_CHIPS = ['全部', '数据分析', '文档处理', '编程开发', '安全审计', '办公效率', 'AI助手'] as const

/** Legacy seed Skill UIDs — stripped on hydrate so old persisted mock installs disappear. */
export const LEGACY_MOCK_SKILL_UIDS = new Set([
  'clawhub:community:algo-art',
  'clawhub:community:doc-pipeline',
  'clawhub:community:meeting-minutes',
  'local:user:notes-sync',
])
