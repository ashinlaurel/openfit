import { describe, expect, it } from 'vitest'
import { parseTodoProposals } from './todo-assistant'

describe('task proposal boundary', () => {
  it('extracts allowed actions without allowing deletes or arbitrary task properties', () => {
    const result = parseTodoProposals('Review this. <!-- openfit:tasks [{"type":"update","id":"a","task":{"notes":"new","id":"other","state":"completed"}},{"type":"purge","id":"a"}] -->')
    expect(result).toEqual([{ type: 'update', id: 'a', task: { notes: 'new' }, actor: 'assistant' }])
  })
  it('ignores malformed proposals and creates without titles', () => {
    expect(parseTodoProposals('<!-- openfit:tasks nope -->')).toEqual([])
    expect(parseTodoProposals('<!-- openfit:tasks [{"type":"create","task":{}}] -->')).toEqual([])
  })
})
