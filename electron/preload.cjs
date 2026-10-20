'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('fitbit', Object.freeze({
  getStatus: () => ipcRenderer.invoke('fitbit:get-status'),
  saveConfig: (config) => ipcRenderer.invoke('fitbit:save-config', config),
  connect: () => ipcRenderer.invoke('fitbit:connect'),
  disconnect: () => ipcRenderer.invoke('fitbit:disconnect'),
  sync: (date) => ipcRenderer.invoke('fitbit:sync', date),
  getCachedData: () => ipcRenderer.invoke('fitbit:get-cached-data'),
  getCachedArchive: () => ipcRenderer.invoke('fitbit:get-cached-archive'),
  exportData: () => ipcRenderer.invoke('fitbit:export-data'),
  openExternal: (url) => ipcRenderer.invoke('fitbit:open-external', url),
  onAuthComplete: (callback) => subscribe('fitbit:auth-complete', callback),
  onSyncProgress: (callback) => subscribe('fitbit:sync-progress', callback),
}))

contextBridge.exposeInMainWorld('healthAssistant', Object.freeze({
  getStatus: () => ipcRenderer.invoke('assistant:get-status'),
  startTurn: (input) => ipcRenderer.invoke('assistant:start-turn', input),
  cancel: (requestId) => ipcRenderer.invoke('assistant:cancel', requestId),
  reset: () => ipcRenderer.invoke('assistant:reset'),
  onEvent: (callback) => subscribe('assistant:event', callback),
}))

contextBridge.exposeInMainWorld('todos', Object.freeze({
  load: () => ipcRenderer.invoke('todos:load'),
  mutate: action => ipcRenderer.invoke('todos:mutate', action),
  batch: actions => ipcRenderer.invoke('todos:batch', actions),
  recover: () => ipcRenderer.invoke('todos:recover'),
  export: () => ipcRenderer.invoke('todos:export'),
  import: () => ipcRenderer.invoke('todos:import'),
}))

contextBridge.exposeInMainWorld('habits', Object.freeze({
  load: () => ipcRenderer.invoke('habits:load'),
  mutate: action => ipcRenderer.invoke('habits:mutate', action),
  export: () => ipcRenderer.invoke('habits:export'),
  recover: () => ipcRenderer.invoke('habits:recover'),
}))

contextBridge.exposeInMainWorld('reader', Object.freeze({
  load: () => ipcRenderer.invoke('reader:load'),
  save: url => ipcRenderer.invoke('reader:save', url),
  subscribe: url => ipcRenderer.invoke('reader:subscribe', url),
  refresh: id => ipcRenderer.invoke('reader:refresh', id),
  fetchArticle: id => ipcRenderer.invoke('reader:fetch-article', id),
  mutate: action => ipcRenderer.invoke('reader:mutate', action),
  export: () => ipcRenderer.invoke('reader:export'),
  recover: () => ipcRenderer.invoke('reader:recover'),
}))

contextBridge.exposeInMainWorld('reports', Object.freeze({
  load: () => ipcRenderer.invoke('reports:load'),
  choose: () => ipcRenderer.invoke('reports:choose'),
  edit: id => ipcRenderer.invoke('reports:edit', id),
  ocr: id => ipcRenderer.invoke('reports:ocr', id),
  assist: id => ipcRenderer.invoke('reports:assist', id),
  cancel: () => ipcRenderer.invoke('reports:cancel'),
  discard: id => ipcRenderer.invoke('reports:discard', id),
  save: (id, input) => ipcRenderer.invoke('reports:save', id, input),
  archive: (id, archived) => ipcRenderer.invoke('reports:archive', id, archived),
  preview: input => ipcRenderer.invoke('reports:preview', input),
  export: () => ipcRenderer.invoke('reports:export'),
  recover: () => ipcRenderer.invoke('reports:recover'),
  onProgress: callback => subscribe('reports:progress', callback),
}))
