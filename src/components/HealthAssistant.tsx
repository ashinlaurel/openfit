import { parseTodoProposals } from '@/lib/todo-assistant'
import type { TodoAction } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react'
import { ArrowDown, ArrowUp, Plus, Sparkles, Square, X } from 'lucide-react'
import { normalizeFitbitData } from '@/data/normalize'
import {
  buildHealthAssistantContext,
  parseAssistantNavigation,
  stripAssistantNavigation,
  visibleAssistantText,
  type AssistantNavigation,
} from '@/lib/health-assistant'
import type {
  DashboardData,
  HealthAssistantEvent,
  HealthAssistantStatus,
  PageId,
  RawHealthArchive,
} from '@/types'

const unavailableStatus: HealthAssistantStatus = {
  available: false,
  connected: false,
  authenticated: false,
  version: null,
}

function messageText(message: ThreadMessage | undefined) {
  if (!message) return ''
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function archiveData(archive: RawHealthArchive | null | undefined) {
  if (!archive) return []
  return Object.values(archive.days)
    .map((payload) => normalizeFitbitData(payload))
    .sort((left, right) => left.selectedDate.localeCompare(right.selectedDate))
}

function statusLabel(status: HealthAssistantStatus, hasBridge: boolean) {
  if (!hasBridge) return 'Desktop only'
  if (!status.available) return 'Codex not found'
  if (!status.authenticated) return 'Sign in to Codex'
  return status.connected ? 'Codex connected' : 'Codex ready'
}

function createQueue() {
  const events: HealthAssistantEvent[] = []
  let wake: ((event: HealthAssistantEvent) => void) | null = null

  return {
    push(event: HealthAssistantEvent) {
      if (wake) {
        const resolve = wake
        wake = null
        resolve(event)
      } else {
        events.push(event)
      }
    },
    next() {
      const event = events.shift()
      if (event) return Promise.resolve(event)
      return new Promise<HealthAssistantEvent>((resolve) => { wake = resolve })
    },
  }
}

export function HealthAssistant({
  open,
  data,
  page,
  onOpenChange,
  onNavigate,
  onProposals,
}: {
  open: boolean
  data: DashboardData
  page: PageId
  onOpenChange: (open: boolean) => void
  onProposals?: (actions: TodoAction[]) => void
  onNavigate: (navigation: AssistantNavigation) => void
}) {
  const dataRef = useRef(data)
  const pageRef = useRef(page)
  const navigateRef = useRef(onNavigate)
  const proposalRef = useRef(onProposals)
  useEffect(() => { proposalRef.current = onProposals }, [onProposals])
  useEffect(() => { void window.healthAssistant?.reset().catch(() => undefined) }, [])
  const [status, setStatus] = useState(unavailableStatus)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { navigateRef.current = onNavigate }, [onNavigate])

  const refreshStatus = useCallback(async () => {
    if (!window.healthAssistant) {
      setStatus(unavailableStatus)
      return
    }
    try {
      setStatus(await window.healthAssistant.getStatus())
    } catch (error) {
      setStatus({
        ...unavailableStatus,
        error: error instanceof Error ? error.message : 'Codex is unavailable.',
      })
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => {
    if (open) void refreshStatus()
  }, [open, refreshStatus])

  const modelAdapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      const bridge = window.healthAssistant
      if (!bridge) throw new Error('Launch OpenFit in the desktop app to use the health assistant.')

      const prompt = messageText(messages.at(-1))
      if (!prompt) throw new Error('Write a question before sending it.')

      let archived: DashboardData[] = []
      if (pageRef.current !== 'todos' && pageRef.current !== 'habits' && window.fitbit && dataRef.current.source !== 'demo') {
        try {
          archived = archiveData(await window.fitbit.getCachedArchive())
        } catch {
          archived = []
        }
      }

      const healthContext = pageRef.current === 'todos' || pageRef.current === 'habits' ? JSON.stringify({ scope: pageRef.current }) : buildHealthAssistantContext(dataRef.current, archived, pageRef.current)
      const requestId = crypto.randomUUID()
      const queue = createQueue()
      let fullText = ''
      let lastVisibleText = ''
      let completed = false

      const unsubscribe = bridge.onEvent((event) => {
        if (event.requestId === requestId) queue.push(event)
      })
      const onAbort = () => queue.push({ requestId, type: 'cancelled' })
      abortSignal.addEventListener('abort', onAbort, { once: true })

      try {
        await bridge.startTurn({ requestId, message: prompt, healthContext, scope: pageRef.current === 'todos' ? 'todos' : pageRef.current === 'habits' ? 'habits' : 'health' })
        void refreshStatus()

        while (!completed) {
          const event = await queue.next()
          if (event.type === 'delta') {
            fullText += event.delta
            const visible = visibleAssistantText(fullText)
            if (visible && visible !== lastVisibleText) {
              lastVisibleText = visible
              yield { content: [{ type: 'text', text: visible }] }
            }
          } else if (event.type === 'complete') {
            completed = true
            if (event.text) fullText = event.text
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            return
          }
        }

        if (pageRef.current === 'todos') {
          const actions = parseTodoProposals(fullText)
          if (actions.length) proposalRef.current?.(actions)
        }
        const navigation = parseAssistantNavigation(fullText)
        const finalText = stripAssistantNavigation(fullText)
        if (navigation) navigateRef.current(navigation)
        if (!finalText) throw new Error('Codex completed the turn without a response.')
        if (finalText !== lastVisibleText) {
          yield { content: [{ type: 'text', text: finalText }] }
        }
      } finally {
        abortSignal.removeEventListener('abort', onAbort)
        unsubscribe()
        if (!completed || abortSignal.aborted) void bridge.cancel(requestId)
        void refreshStatus()
      }
    },
  }), [refreshStatus])

  const runtime = useLocalRuntime(modelAdapter)
  const ready = Boolean(window.healthAssistant && status.available && status.authenticated)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside
        id="health-assistant"
        className={`health-assistant ${open ? 'is-open' : ''}`}
        aria-label={page === 'todos' ? 'Task assistant' : page === 'habits' ? 'Habit assistant' : 'Health assistant'}
        aria-hidden={!open}
        inert={!open}
      >
        <AssistantHeader
          habitMode={page === 'habits'}
          taskMode={page === 'todos'}
          status={status}
          ready={ready}
          onClose={() => onOpenChange(false)}
          onStatusRefresh={refreshStatus}
        />
        <AssistantThread ready={ready} habitMode={page === 'habits'}
          taskMode={page === 'todos'} />
      </aside>
      {open && <button className="assistant-scrim" aria-label={page === 'todos' ? 'Close task assistant' : page === 'habits' ? 'Close habit assistant' : 'Close health assistant'} onClick={() => onOpenChange(false)} />}
    </AssistantRuntimeProvider>
  )
}

function AssistantHeader({
  habitMode,
  taskMode,
  status,
  ready,
  onClose,
  onStatusRefresh,
}: {
  habitMode: boolean
  taskMode: boolean
  status: HealthAssistantStatus
  ready: boolean
  onClose: () => void
  onStatusRefresh: () => Promise<void>
}) {
  const runtime = useAssistantRuntime()

  const newConversation = async () => {
    runtime.thread.cancelRun()
    runtime.thread.reset()
    await window.healthAssistant?.reset()
    await onStatusRefresh()
  }

  return (
    <header className="assistant-header">
      <div className="assistant-title">
        <span className="assistant-mark"><Sparkles aria-hidden="true" /></span>
        <span>
          <strong>{taskMode ? 'Task assistant' : habitMode ? 'Habit assistant' : 'Health assistant'}</strong>
          <small><i className={ready ? 'is-ready' : ''} />{statusLabel(status, Boolean(window.healthAssistant))}</small>
        </span>
      </div>
      <div className="assistant-header-actions">
        <button type="button" aria-label="New conversation" title="New conversation" onClick={() => void newConversation()}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label="Close assistant" title="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function AssistantThread({ ready, taskMode, habitMode }: { ready: boolean; taskMode: boolean; habitMode: boolean }) {
  return (
    <ThreadPrimitive.Root className="assistant-thread">
      <ThreadPrimitive.Viewport className="assistant-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="assistant-welcome">
            <h2>{taskMode ? 'Make a plan that works.' : habitMode ? 'Find your rhythm.' : 'Ask your health data.'}</h2>
            <p>{taskMode ? 'Prioritize tasks, break work into steps, and review proposed changes before applying them.' : habitMode ? 'Reflect on your routines, explore your consistency, and make your next step a little easier.' : 'I can compare days, explain trends, and take you to the relevant view.'}</p>
            <div className="assistant-suggestions" aria-label="Suggested questions">
              {habitMode ? <><ThreadPrimitive.Suggestion prompt="Reflect on my recorded habit check-ins and schedules. What patterns can you see?" send disabled={!ready}>Reflect on my rhythm</ThreadPrimitive.Suggestion><ThreadPrimitive.Suggestion prompt="Help me make my current habits easier to maintain, based on their schedules." send disabled={!ready}>Make it sustainable</ThreadPrimitive.Suggestion></> : taskMode ? <><ThreadPrimitive.Suggestion prompt="Help me prioritize my active tasks. Explain your reasoning." send disabled={!ready}>Prioritize my tasks</ThreadPrimitive.Suggestion><ThreadPrimitive.Suggestion prompt="Suggest a realistic plan for today from my tasks." send disabled={!ready}>Plan today</ThreadPrimitive.Suggestion><ThreadPrimitive.Suggestion prompt="Find tasks that could be broken into smaller steps. Propose additions for me to review." send disabled={!ready}>Break down tasks</ThreadPrimitive.Suggestion></> : <>
              <ThreadPrimitive.Suggestion prompt="How did I sleep last night?" send disabled={!ready}>How did I sleep?</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Compare my activity over the last seven days." send disabled={!ready}>Compare this week</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Show me my heart health data." send disabled={!ready}>Open heart data</ThreadPrimitive.Suggestion></>}
            </div>
          </div>
        </AuiIf>

        <div className="assistant-messages">
          <ThreadPrimitive.Messages>
            {({ message }) => message.role === 'user' ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter className="assistant-viewport-footer">
          <ThreadPrimitive.ScrollToBottom className="assistant-scroll-bottom" aria-label="Scroll to latest response">
            <ArrowDown aria-hidden="true" />
          </ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className="assistant-composer">
            <ComposerPrimitive.Input
              className="assistant-composer-input"
              rows={1}
              disabled={!ready}
              placeholder={ready ? taskMode ? 'Ask about your tasks…' : habitMode ? 'Ask about your habits…' : 'Ask about your health…' : 'Connect Codex Desktop to chat'}
              aria-label={taskMode ? 'Message task assistant' : habitMode ? 'Message habit assistant' : 'Message health assistant'}
            />
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send className="assistant-send" disabled={!ready} aria-label="Send message">
                <ArrowUp aria-hidden="true" />
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel className="assistant-send is-cancel" aria-label="Stop response">
                <Square aria-hidden="true" />
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </ComposerPrimitive.Root>
          <p className="assistant-disclaimer">{taskMode ? 'Sending shares non-trashed tasks with Codex. Changes need your review.' : habitMode ? 'Sending shares habit history with Codex. Reflection only; no changes.' : 'Health context, not medical advice.'}</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="assistant-user-message">
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="assistant-ai-message">
      <span className="assistant-response-mark" aria-hidden="true">+</span>
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}
