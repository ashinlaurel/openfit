import type { TodoAction } from '@/types'
export function parseTodoProposals(text: string): TodoAction[] {
  const match = text.match(/<!--\s*openfit:tasks\s+([\s\S]*?)\s*-->/)
  if (!match) return []
  try {
    const value: unknown = JSON.parse(match[1])
    if (!Array.isArray(value) || value.length > 20) return []
    return value.filter((a): a is TodoAction => {
      if (!a || typeof a !== 'object') return false
      const action = a as TodoAction
      if (!['create', 'update', 'complete', 'reopen'].includes(action.type)) return false
      if (action.type !== 'create' && typeof action.id !== 'string') return false
      if (action.type === 'create' && (typeof action.task?.title !== 'string' || !action.task.title.trim())) return false
      return true
    }).map(a => ({ type: a.type, id: a.id, task: a.task && Object.fromEntries(Object.entries({ title: a.task.title, notes: a.task.notes, due: a.task.due, priority: a.task.priority, tags: a.task.tags }).filter(([, value]) => value !== undefined)), actor: 'assistant' }))
  } catch { return [] }
}
