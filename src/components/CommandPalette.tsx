import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { ArrowUpDown, CornerDownLeft, Search } from 'lucide-react'

export interface PaletteCommand {
  id: string
  label: string
  description: string
  keywords?: string
  icon: ReactNode
  disabled?: boolean
  run: () => void
}

export function CommandPalette({ open, onOpenChange, commands }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: PaletteCommand[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const results = commands.filter(command => words.every(word =>
    `${command.label} ${command.description} ${command.keywords ?? ''}`.toLowerCase().includes(word)))
  const enabled = results.filter(command => !command.disabled)
  const selected = enabled[Math.min(active, Math.max(0, enabled.length - 1))]

  useEffect(() => {
    if (open) { setQuery(''); setActive(0) }
  }, [open])

  useEffect(() => {
    if (open && selected) {
      listRef.current?.querySelector(`[data-command-id="${selected.id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, selected?.id])

  const execute = (command: PaletteCommand) => {
    if (command.disabled) return
    onOpenChange(false)
    command.run()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content className="command-palette" onOpenAutoFocus={event => {
          event.preventDefault()
          inputRef.current?.focus()
        }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search pages and actions. Use arrow keys to select and Enter to run.</Dialog.Description>
          <div className="command-search">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              placeholder="Where would you like to go?"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
              value={query}
              onChange={event => { setQuery(event.target.value); setActive(0) }}
              onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const index = enabled.indexOf(selected)
                  setActive(enabled.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length : 0)
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (selected) execute(selected)
                }
              }}
            />
            <Dialog.Close className="command-escape" aria-label="Close command palette">Esc</Dialog.Close>
          </div>
          <div className="command-results" id={listId} role="listbox" aria-label="Commands" ref={listRef}>
            {results.map(command => (
              <div
                key={command.id}
                id={`${listId}-${command.id}`}
                data-command-id={command.id}
                role="option"
                aria-selected={selected?.id === command.id}
                aria-disabled={command.disabled || undefined}
                className="command-option"
                onPointerMove={() => { if (!command.disabled) setActive(enabled.indexOf(command)) }}
                onMouseDown={event => event.preventDefault()}
                onClick={() => execute(command)}
              >
                <span className="command-icon">{command.icon}</span>
                <span className="command-copy"><strong>{command.label}</strong><small>{command.description}</small></span>
                {selected?.id === command.id && <CornerDownLeft className="command-return" aria-hidden="true" />}
              </div>
            ))}
            {!results.length && <div className="command-empty" role="status">No commands found. Try “sleep”, “sync”, or “settings”.</div>}
          </div>
          <div className="command-footer"><span><ArrowUpDown aria-hidden="true" /> Navigate</span><span><CornerDownLeft aria-hidden="true" /> Run command</span><span>OpenFit</span></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
