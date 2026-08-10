const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('skillMesh', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  storage: {
    loadState: () => ipcRenderer.invoke('storage:loadState'),
    saveState: (state) => ipcRenderer.invoke('storage:saveState', state),
  },
  dialog: {
    openSkillPackage: () => ipcRenderer.invoke('dialog:openSkillPackage'),
    openDirectory: (payload) => ipcRenderer.invoke('dialog:openDirectory', payload),
    confirm: (payload) => ipcRenderer.invoke('dialog:confirm', payload),
    restartPrompt: (payload) => ipcRenderer.invoke('dialog:restartPrompt', payload),
  },
  shell: {
    openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
    openExternal: (targetUrl) => ipcRenderer.invoke('shell:openExternal', targetUrl),
    openSkillDir: (payload) => ipcRenderer.invoke('shell:openSkillDir', payload),
  },
  agents: {
    scan: () => ipcRenderer.invoke('agents:scan'),
    syncSkill: (payload) => ipcRenderer.invoke('agents:syncSkill', payload),
    validateSkillPath: (payload) => ipcRenderer.invoke('agents:validateSkillPath', payload),
  },
  skills: {
    ensurePackage: (skill) => ipcRenderer.invoke('skills:ensurePackage', skill),
    removePackage: (localPath) => ipcRenderer.invoke('skills:removePackage', localPath),
    verifyPackage: (payload) => ipcRenderer.invoke('skills:verifyPackage', payload),
    verifyPackages: (items) => ipcRenderer.invoke('skills:verifyPackages', items),
    packZip: (payload) => ipcRenderer.invoke('skills:packZip', payload),
    readMarkdown: (payload) => ipcRenderer.invoke('skills:readMarkdown', payload),
  },
  sources: {
    testConnection: (payload) => ipcRenderer.invoke('sources:testConnection', payload),
    listSkills: (payload) => ipcRenderer.invoke('sources:listSkills', payload),
  },
  auth: {
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: (payload) => ipcRenderer.invoke('auth:logout', payload),
    me: (payload) => ipcRenderer.invoke('auth:me', payload),
    myNamespaces: (payload) => ipcRenderer.invoke('auth:myNamespaces', payload),
  },
  hub: {
    publish: (payload) => ipcRenderer.invoke('hub:publish', payload),
    withdrawReview: (payload) => ipcRenderer.invoke('hub:withdrawReview', payload),
    deleteSkill: (payload) => ipcRenderer.invoke('hub:deleteSkill', payload),
    getSkillVersionStatus: (payload) => ipcRenderer.invoke('hub:getSkillVersionStatus', payload),
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
    setSkillsRoot: (payload) => ipcRenderer.invoke('app:setSkillsRoot', payload),
    getDiskSpace: (payload) => ipcRenderer.invoke('app:getDiskSpace', payload),
  },
  logs: {
    getInfo: () => ipcRenderer.invoke('logs:getInfo'),
    append: (payload) => ipcRenderer.invoke('logs:append', payload),
    purge: () => ipcRenderer.invoke('logs:purge'),
    openDir: () => ipcRenderer.invoke('logs:openDir'),
  },
})
