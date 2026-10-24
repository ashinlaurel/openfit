'use strict'

function profileKey(config) {
  if (!config?.apiUrl || !config?.user?.id) throw new Error('Connect Open Gym before linking workouts.')
  return JSON.stringify([config.apiUrl, config.user.id])
}
function read(store, config) {
  const value = store?.profiles?.[profileKey(config)]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, id]) => key.length > 0 && key.length <= 512 && (id === null || typeof id === 'string' && id.length > 0 && id.length <= 2048)))
}
function update(store, config, input) {
  if (!input || typeof input.gymId !== 'string' || !input.gymId || input.gymId.length > 512 || !['auto', 'link', 'unlink'].includes(input.mode)) throw new Error('Invalid workout link.')
  if (input.mode === 'link' && (typeof input.healthId !== 'string' || !input.healthId || input.healthId.length > 2048)) throw new Error('Invalid Google Health workout reference.')
  const links = read(store, config)
  if (input.mode === 'auto') delete links[input.gymId]
  else {
    if (input.mode === 'link') for (const [id, healthId] of Object.entries(links)) {
      if (healthId === input.healthId && id !== input.gymId) Object.defineProperty(links, id, { value: null, enumerable: true, configurable: true, writable: true })
    }
    Object.defineProperty(links, input.gymId, { value: input.mode === 'unlink' ? null : input.healthId, enumerable: true, configurable: true, writable: true })
  }
  if (Object.keys(links).length > 5000) throw new Error('Too many saved workout links.')
  return { links, store: { version: 1, profiles: { ...(store?.profiles || {}), [profileKey(config)]: links } } }
}
module.exports = { read, update }
