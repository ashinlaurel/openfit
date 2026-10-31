import { webMode, emptyWebHealth } from '@/lib/web-bridge'
import { useWebAccessActions } from '@/components/WebAccess'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronsUpDown, LoaderCircle, RefreshCw, MessageCircle, Search, ListTodo, Flame, BookOpen, Rss, Bookmark, FileHeart, FileUp, Wine, Dumbbell } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CloudStatus, DashboardData, FitbitAuthStatus, FitbitConfigInput, HealthProvider, PageId } from '@/types'
import { DEFAULT_CLOUD_API } from '@/lib/cloud-config'
import { createDemoData, localIso } from '@/data/demo'
import { normalizeFitbitData } from '@/data/normalize'
import { formatDate, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ActivityView, MovementView, BodyView, DevicesView, HealthView, SleepView, TodayView } from '@/components/Views'
import { HabitsView } from '@/components/HabitsView'
import { useHabits } from '@/lib/use-habits'
import { TodosView } from '@/components/TodosView'
import { useTodos } from '@/lib/use-todos'
import { ReaderView } from '@/components/ReaderView'
import { useReader } from '@/lib/use-reader'
import { DrinkingView } from '@/components/DrinkingView'
import { ReportsView } from '@/components/ReportsView'
import { GymView } from '@/components/GymView'
import { useReports } from '@/lib/use-reports'
import type { TodoAction } from '@/types'
import { CommandPalette, type PaletteCommand } from '@/components/CommandPalette'
import { HealthAssistant } from '@/components/HealthAssistant'
import type { AssistantNavigation } from '@/lib/health-assistant'
import type { AppIcon } from '@/components/icons'
import {
  ActivityIcon,
  BodyIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CloudIcon,
  DeviceIcon,
  DisconnectIcon,
  ExportIcon,
  ExternalIcon,
  HeartIcon,
  LoaderIcon,
  SettingsIcon,
  ShieldIcon,
  SleepIcon,
  SparkleIcon,
  StepsIcon,
  TodayIcon,
} from '@/components/icons'

type NavCategory = 'utility' | 'summary' | 'activity' | 'heart' | 'sleep' | 'body' | 'device'

const navItems: Array<{ id: PageId; label: string; copy: string; icon: AppIcon; category: NavCategory }> = [
  { id: 'today', label: 'Home', copy: 'The day’s essential overview.', icon: TodayIcon, category: 'summary' },
  { id: 'movement', label: 'Movement', copy: 'Steps, daily movement, and your workday rhythm.', icon: StepsIcon, category: 'activity' },
  { id: 'activity', label: 'Activity', copy: 'Workout sessions, training time, and exercise details.', icon: ActivityIcon, category: 'activity' },
  { id: 'gym', label: 'Gym', copy: 'Strength workouts synced from Open Gym.', icon: Dumbbell, category: 'activity' },
  { id: 'health', label: 'Health', copy: 'Cardiac and physiological signals over time.', icon: HeartIcon, category: 'heart' },
  { id: 'sleep', label: 'Sleep', copy: 'Sleep sessions, overnight signals, and your recent sleep schedule.', icon: SleepIcon, category: 'sleep' },
  { id: 'body', label: 'Body', copy: 'Weight, composition, and daily balance.', icon: BodyIcon, category: 'body' },
  { id: 'drinking', label: 'Drinking', copy: 'Your drinking pattern, alcohol-free days, and reduction goals.', icon: Wine, category: 'body' },
  { id: 'habits', label: 'Habits', copy: 'Small steps. A rhythm that feels like yours.', icon: Flame, category: 'utility' },
  { id: 'todos', label: 'Todos', copy: 'Tasks, plans, and a little room to think.', icon: ListTodo, category: 'utility' },
  { id: 'reports', label: 'Reports', copy: 'Medical reports, latest results, and your history over time.', icon: FileHeart, category: 'utility' },
  { id: 'reader', label: 'Reader', copy: 'Saved articles, favourite feeds, and room to read.', icon: BookOpen, category: 'utility' },
  { id: 'devices', label: 'Data', copy: 'Sources, coverage, and local protection.', icon: DeviceIcon, category: 'device' },
]

const defaultStatus: FitbitAuthStatus = {
  isElectron: Boolean(window.fitbit),
  configured: false,
  connected: false,
  clientId: '',
  redirectUri: 'http://127.0.0.1:42813/oauth/callback',
  hasClientSecret: false,
  storageEncrypted: false,
  lastSyncAt: null,
  provider: 'google-health',
}

interface ToastState {
  tone: 'success' | 'error' | 'neutral'
  message: string
}

interface SyncProgressState {
  completed: number
  total: number
  key?: string
  date?: string
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><Button aria-label={label} variant="ghost" size="icon" {...props}>{children}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function App() {
  const reports = useReports()
  const [reportUpload, setReportUpload] = useState(0)
  const reader = useReader()
  const [readerRequest, setReaderRequest] = useState<{kind:'save'|'subscribe'|'search';serial:number}>({kind:'save',serial:0})
  const habits = useHabits()
  const [habitCreate, setHabitCreate] = useState(0)
  const todos = useTodos()
  const [todoFocus, setTodoFocus] = useState(0)
  const [proposals, setProposals] = useState<TodoAction[]>([])
  const [page, setPage] = useState<PageId>('today')
  const [selectedDate, setSelectedDate] = useState(localIso())
  const [data, setData] = useState<DashboardData>(() => webMode || window.fitbit ? normalizeFitbitData(emptyWebHealth()) : createDemoData())
  const [status, setStatus] = useState(defaultStatus)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>({ configured: false, apiUrl: '', user: null })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (!event.repeat) setPaletteOpen(open => !open)
      }
    }
    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [])
  useEffect(() => window.cloud?.onSync(result => {
    if (!result.ok && result.error) setToast({ tone: 'error', message: `Cloud save failed: ${result.error}` })
  }), [])
  const [syncing, setSyncing] = useState(false)
  const [syncTargetDate, setSyncTargetDate] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(null)
  const [backgroundSyncProgress, setBackgroundSyncProgress] = useState<SyncProgressState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const selectedDateRef = useRef(selectedDate)
  const cacheReadVersion = useRef(0)
  const syncingRef = useRef(false)
  const syncTargetDateRef = useRef<string | null>(null)
  const queuedDateRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [page])

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  const showCachedDate = useCallback(async (date: string, fallbackToLatest = false) => {
    if (!window.fitbit) return false
    const version = ++cacheReadVersion.current
    let payload = await window.fitbit.getCachedData(date)
    if (!payload && fallbackToLatest) payload = await window.fitbit.getCachedData()
    // A late disk read must not replace a newer selection or completed refresh.
    if (!payload || version !== cacheReadVersion.current || selectedDateRef.current !== date) return false
    setData({ ...normalizeFitbitData(payload), source: 'cache' })
    return payload.date === date
  }, [])

  const startupLoaded = useRef(false)
  const loadNativeState = useCallback(async () => {
    if (!window.fitbit) return false
    const startingDate = selectedDateRef.current
    // Render the cache as soon as it arrives, independently of cloud pairing.
    const cached = showCachedDate(startingDate, true).catch(() => undefined)
    void window.cloud?.getStatus().then(setCloudStatus).catch(() => undefined)
    try {
      const nextStatus = await window.fitbit.getStatus()
      setStatus(nextStatus)
      await cached
      return nextStatus.connected
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to read the local status.' })
      return false
    }
  }, [showCachedDate])

  const runSync = useCallback(async (requestedDate?: string) => {
    if (!window.fitbit) {
      setSettingsOpen(true)
      return
    }

    const firstDate = requestedDate ?? selectedDateRef.current
    if (syncingRef.current) {
      queuedDateRef.current = firstDate
      return
    }

    syncingRef.current = true
    setSyncing(true)
    let nextDate: string | null = firstDate

    try {
      while (nextDate) {
        const date: string = nextDate
        queuedDateRef.current = null
        syncTargetDateRef.current = date
        setSyncTargetDate(date)
        setSyncProgress({ completed: 0, total: 0 })

        try {
          const payload = await window.fitbit.sync(date)
          const normalized = normalizeFitbitData(payload)

          if (selectedDateRef.current === date) {
            cacheReadVersion.current += 1
            setData(normalized)
            setToast({
              tone: payload.cacheHit || payload.errors.length ? 'neutral' : 'success',
              message: payload.cacheHit
                ? 'Day loaded from the local archive.'
                : payload.errors.length
                ? `Updated. ${payload.errors.length} sources have no data for this period.`
                : 'Data updated.',
            })
          }

          void window.fitbit.getStatus().then(setStatus).catch(() => undefined)
        } catch (error) {
          const queuedDate = queuedDateRef.current
          const failedDateIsStillSelected = selectedDateRef.current === date
          const hasDifferentDateQueued = Boolean(queuedDate && queuedDate !== date)

          if (failedDateIsStillSelected && !hasDifferentDateQueued) {
            // Keep the last readable snapshot on screen when a refresh fails.
            setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Sync failed.' })
          }
        }

        const queuedDate = queuedDateRef.current
        queuedDateRef.current = null
        nextDate = queuedDate && queuedDate !== date ? queuedDate : null
      }
    } finally {
      syncingRef.current = false
      syncTargetDateRef.current = null
      queuedDateRef.current = null
      setSyncing(false)
      setSyncTargetDate(null)
      setSyncProgress(null)
    }
  }, [])

  useEffect(() => {
    if (!startupLoaded.current) {
      startupLoaded.current = true
      void loadNativeState().then(connected => { if (connected) void runSync() })
    }
    if (!window.fitbit) return
    const unsubscribeAuth = window.fitbit.onAuthComplete(async (result) => {
      setConnecting(false)
      if (!result.ok) {
        setToast({ tone: 'error', message: result.error ?? 'Authorization failed.' })
        return
      }
      setSettingsOpen(false)
      const authDate = selectedDateRef.current
      setToast({ tone: 'success', message: 'Account connected. Syncing data…' })
      await loadNativeState()
      selectedDateRef.current = authDate
      setSelectedDate(authDate)
      void runSync(authDate)
    })
    const unsubscribeSync = window.fitbit.onSyncProgress((progress) => {
      if (syncingRef.current && (!progress.date || progress.date === syncTargetDateRef.current)) {
        setBackgroundSyncProgress(null)
        setSyncProgress(progress)
      } else {
        // The native process also fills missing historical days after a refresh.
        setBackgroundSyncProgress(progress.completed < progress.total ? progress : null)
      }
    })
    return () => {
      unsubscribeAuth()
      unsubscribeSync()
    }
  }, [loadNativeState, runSync])

  useEffect(() => {
    let active = true
    // Settings can be provisioned by the local setup tools while the app is open.
    // Refresh connection flags on return without changing the selected health date.
    const refreshConnections = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const [nextHealth, nextCloud] = await Promise.all([window.fitbit?.getStatus(), window.cloud?.getStatus()])
        if (!active) return
        if (nextHealth) setStatus(nextHealth)
        if (nextCloud) setCloudStatus(nextCloud)
      } catch { /* A source view provides retry and offline status. */ }
    }
    window.addEventListener('focus', refreshConnections)
    return () => { active = false; window.removeEventListener('focus', refreshConnections) }
  }, [])

  useEffect(() => {
    if (!toast) return
    if (toast.tone === 'error') return
    const timer = window.setTimeout(() => setToast(null), 4_500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const visibleNav = webMode ? navItems.filter(item => item.id !== 'reader') : navItems

  const changeDate = (date: string) => {
    if (!date || date > localIso()) return
    selectedDateRef.current = date
    queuedDateRef.current = null
    setSelectedDate(date)
    if (data.source === 'demo' && !status.connected) {
      const demoData = createDemoData(date)
      cacheReadVersion.current += 1
      setData(demoData)
      return
    }
    if (window.fitbit) {
      void showCachedDate(date).catch(() => false).then(cacheHit => {
        if (!cacheHit && status.connected && selectedDateRef.current === date) void runSync(date)
      })
    }
  }

  const connect = async () => {
    if (!window.fitbit) {
      setToast({ tone: 'neutral', message: 'Launch OpenFit in the Electron app to connect your health provider.' })
      return
    }
    if (!status.configured) {
      setSettingsOpen(true)
      return
    }
    setConnecting(true)
    try {
      const result = await window.fitbit.connect()
      if (!result.ok) throw new Error(result.message ?? 'Unable to start OAuth.')
      setToast({ tone: 'neutral', message: 'Complete authorization in your browser.' })
    } catch (error) {
      setConnecting(false)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Connection failed.' })
    }
  }

  const saveAndConnect = async (config: FitbitConfigInput) => {
    if (!window.fitbit) return
    try {
      const nextStatus = await window.fitbit.saveConfig(config)
      setStatus(nextStatus)
      setConnecting(true)
      const result = await window.fitbit.connect()
      if (!result.ok) throw new Error(result.message ?? 'Unable to start OAuth.')
      setToast({ tone: 'neutral', message: 'Authorize OpenFit in the browser window.' })
    } catch (error) {
      setConnecting(false)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Invalid configuration.' })
    }
  }

  const disconnect = async () => {
    if (!window.fitbit) return
    setStatus(await window.fitbit.disconnect())
    cacheReadVersion.current += 1
    setBackgroundSyncProgress(null)
    setData(createDemoData(selectedDate))
    setSettingsOpen(false)
    setPage('today')
    setToast({ tone: 'success', message: 'Account disconnected and local data removed.' })
  }

  const exportData = async () => {
    if (!window.fitbit || data.source === 'demo') {
      setToast({ tone: 'neutral', message: 'Connect Google Health to export real data.' })
      return
    }
    const result = await window.fitbit.exportData()
    if (!result.canceled) setToast({ tone: 'success', message: 'JSON archive exported.' })
  }

  const pairCloud = async (apiUrl: string, code: string) => {
    if (!window.cloud) throw new Error('Cloud pairing is available in the desktop app.')
    const next = await window.cloud.pair(apiUrl, code)
    setCloudStatus(next)
    setToast({ tone: 'success', message: `Connected to Open Gym${next.user?.name ? ` as ${next.user.name}` : ''}.` })
  }

  const disconnectCloud = async () => {
    const next = await window.cloud?.disconnect()
    if (next) setCloudStatus(next)
    setToast({ tone: 'neutral', message: 'Open Gym access was removed from this device. Use “Sign out everywhere” in Open Gym to revoke all paired devices.' })
  }

  const currentView = useMemo(() => {
    const props = { data, status, navigate: setPage, cloudStatus }
    if (page === 'drinking') return <DrinkingView />
    if (page === 'reports') return <ReportsView reports={reports} uploadRequest={reportUpload} />
    if (page === 'reader' && webMode) return <p>Reader is available in the Mac app.</p>
    if (page === 'reader') return <ReaderView reader={reader} request={readerRequest} />
    if (page === 'gym') return <GymView data={data} cloudStatus={cloudStatus} onConnect={() => setSettingsOpen(true)} onSyncHealth={() => runSync()} healthConnected={status.connected} healthSyncing={syncing}/>
    if (page === 'habits') return <HabitsView habits={habits} createRequest={habitCreate} />
    if (page === 'todos') return <TodosView todos={todos} focusRequest={todoFocus} onAssistant={() => setAssistantOpen(true)} />
    if (page === 'movement') return <MovementView {...props} />
    if (page === 'activity') return <ActivityView {...props} />
    if (page === 'health') return <HealthView {...props} />
    if (page === 'sleep') return <SleepView {...props} />
    if (page === 'body') return <BodyView {...props} />
    if (page === 'devices') return <DevicesView {...props} />
    return <TodayView {...props} />
  }, [data, page, status, cloudStatus, syncing, runSync, todos, todoFocus, habits, habitCreate, reader, readerRequest, reports, reportUpload])

  const isToday = selectedDate === localIso()
  const sourceLabel = status.connected
    ? status.provider === 'fitbit-legacy' ? 'Fitbit legacy' : 'Google Health'
    : data.source === 'demo' ? 'Demo data' : 'Local cache'
  const pageMeta = navItems.find((item) => item.id === page) ?? navItems[0]
  const showingPreviousDate = data.source !== 'demo' && data.selectedDate !== selectedDate
  const visibleSyncProgress = backgroundSyncProgress ?? syncProgress
  const visibleSyncDate = backgroundSyncProgress?.date ?? syncTargetDate
  const syncProgressPercent = visibleSyncProgress && visibleSyncProgress.total > 0
    ? Math.round(visibleSyncProgress.completed / visibleSyncProgress.total * 100)
    : null
  const syncProgressLabel = visibleSyncProgress?.total
    ? `${visibleSyncProgress.completed} of ${visibleSyncProgress.total} sources`
    : 'Starting…'
  const batteryLevel = data.device?.batteryLevel == null
    ? null
    : Math.max(0, Math.min(100, Math.round(data.device.batteryLevel)))

  const navigate = (nextPage: PageId) => {
    setPage(nextPage)
  }

  const navigateFromAssistant = (navigation: AssistantNavigation) => {
    if (navigation.date) changeDate(navigation.date)
    if (navigation.page) setPage(navigation.page)
  }

  const commands: PaletteCommand[] = [
    { id:'upload-report', label:'Upload a medical report PDF', description:'Extract and review laboratory results locally.', keywords:'reports blood labs medical pdf tests', icon:<FileUp/>, disabled:reports.busy, run:()=>{setPage('reports');setReportUpload(value=>value+1)} },
    ...(['save', 'subscribe', 'search'] as const).map(kind => ({ id:`reader-${kind}`, label:kind === 'save' ? 'Save an article' : kind === 'subscribe' ? 'Subscribe to an RSS feed' : 'Search your reading library', description:'Open Reader · saved articles and publications.', keywords:'reader read news bookmark rss atom feeds articles', icon:kind === 'subscribe' ? <Rss/> : <Bookmark/>, run:() => { setPage('reader'); setReaderRequest(value => ({kind,serial:value.serial+1})) } })),
    { id: 'refresh-reader', label: 'Refresh RSS feeds', description:'Fetch headlines from your Reader subscriptions.', keywords:'reader news articles sync', icon:<RefreshCw/>, disabled:reader.busy || !reader.store.feeds.length, run:() => { setPage('reader'); void reader.perform({type:'refresh'}) } },
    { id: 'new-habit', label: 'Create a habit', description: 'Start a new ritual with a flexible schedule.', keywords: 'streak routine tracker', icon: <Flame />, run: () => { setPage('habits'); setHabitCreate(n => n + 1) } },
    { id: 'export-habits', label: 'Export habit history', description: 'Save an unencrypted JSON copy of your rituals and check-ins.', icon: <ExportIcon />, disabled: !window.habits || habits.busy, run: () => { void habits.perform('export') } },
    { id: 'search-tasks', label: 'Search tasks', description: 'Find tasks by title, notes, or tags.', keywords: 'todo find', icon: <Search />, run: () => { setPage('todos'); setTodoFocus(v => -(Math.abs(v) + 1)) } },
    { id: 'export-tasks', label: 'Export tasks as JSON', description: 'Save an unencrypted portable copy of tasks and history.', icon: <ExportIcon />, disabled: !window.todos || todos.busy, run: () => { void todos.perform('export') } },
    { id: 'new-task', label: 'Add a task', description: 'Open Todos and focus quick entry.', keywords: 'todo new create', icon: <ListTodo />, run: () => { setPage('todos'); setTodoFocus(v => Math.abs(v) + 1) } },
    { id: 'plan-tasks', label: 'Plan tasks with Codex', description: 'Open the task assistant.', keywords: 'todo prioritize', icon: <MessageCircle />, run: () => { setPage('todos'); setAssistantOpen(true) } },
    ...navItems.map(item => ({
      id: `page-${item.id}`, label: `Go to ${item.label}`, description: item.copy,
      keywords: item.id === 'movement' ? 'steps walking sedentary desk workday inactivity distance' : item.id === 'activity' ? 'workout exercise training sessions' : item.id === 'devices' ? 'devices sources coverage' : item.id === 'health' ? 'heart hrv recovery' : '',
      icon: <item.icon />, run: () => setPage(item.id),
    })),
    { id: 'assistant', label: 'Open health assistant', description: 'Ask questions about your health data.', keywords: 'chat ai', icon: <MessageCircle />, run: () => setAssistantOpen(true) },
    { id: 'settings', label: 'Open settings', description: 'Manage your connection and preferences.', icon: <SettingsIcon />, run: () => setSettingsOpen(true) },
    { id: 'today', label: 'Jump to today', description: 'Show the latest day.', icon: <CalendarIcon />, run: () => changeDate(localIso()) },
    { id: 'previous', label: 'Previous day', description: 'View the day before the selected date.', icon: <ChevronLeftIcon />, run: () => changeDate(shiftDate(selectedDate, -1)) },
    { id: 'next', label: 'Next day', description: isToday ? 'Already viewing today.' : 'View the next day.', disabled: isToday, icon: <ChevronRightIcon />, run: () => changeDate(shiftDate(selectedDate, 1)) },
    { id: 'sync', label: 'Sync health data', description: syncing ? 'Sync is already in progress.' : status.connected ? 'Refresh data from your connected provider.' : 'Connect a provider in Settings first.', keywords: 'refresh', disabled: syncing || !status.connected, icon: <RefreshCw />, run: () => { void runSync() } },
    { id: 'export', label: 'Export health data', description: window.fitbit ? 'Save your local data as JSON.' : 'Available in the desktop app.', disabled: !window.fitbit, icon: <ExportIcon />, run: () => { void exportData() } },
  ]

  return (
    <SidebarProvider className={cn('app-shell', assistantOpen && page !== 'reports' && page !== 'drinking' && 'assistant-open')}>
      <div className="window-drag-region" />
      <OpenFitSidebar
        items={visibleNav}
        page={page}
        userName={data.profile.displayName}
        userAvatar={data.profile.avatar}
        sourceLabel={sourceLabel}
        syncStatus={syncing || backgroundSyncProgress ? {
          label: visibleSyncDate ? `Updating ${formatDate(visibleSyncDate, { day: 'numeric', month: 'short' })}` : 'Updating health data',
          detail: syncProgressLabel,
          percent: syncProgressPercent,
        } : null}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
      />

      <SidebarInset className="main-area">
        <header className="topbar">
          <div className="topbar-heading">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="sidebar-trigger" aria-label="Toggle navigation" />
              </TooltipTrigger>
              <TooltipContent>Toggle navigation</TooltipContent>
            </Tooltip>
            <div>
              <h1>{pageMeta.label}</h1>
              <p className="topbar-meta">
                <span>{page === 'today' ? formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' }) : pageMeta.copy}</span>
                {showingPreviousDate && <span className="cached-date-note">Showing saved data for {formatDate(data.selectedDate, { day: 'numeric', month: 'short' })}</span>}
              </p>
            </div>
          </div>

          <div className="topbar-actions">
            <IconButton label="Search commands (⌘P / Ctrl+P)" onClick={() => setPaletteOpen(true)}><Search /></IconButton>
            {page !== 'todos' && page !== 'habits' && page !== 'reader' && page !== 'reports' && page !== 'drinking' && page !== 'gym' && <>
            <div className="date-control">
              <IconButton label="Previous day" onClick={() => changeDate(shiftDate(selectedDate, -1))}><ChevronLeftIcon /></IconButton>
              <label className="date-picker">
                <CalendarIcon aria-hidden="true" />
                <span>{isToday ? 'Today' : formatDate(selectedDate, { day: 'numeric', month: 'short' })}</span>
                <input type="date" aria-label="Health date (India Standard Time)" title="India Standard Time (UTC+05:30)" value={selectedDate} max={localIso()} onChange={(event) => changeDate(event.target.value)} />
              </label>
              <IconButton label="Next day" disabled={isToday} onClick={() => changeDate(shiftDate(selectedDate, 1))}><ChevronRightIcon /></IconButton>
            </div>

            {batteryLevel != null && (
              <div className="fitbit-battery" role="status" aria-label={`Fitbit battery ${batteryLevel}%`}>
                <span className="battery-glyph" aria-hidden="true">
                  <span className="battery-charge" style={{ width: `${batteryLevel}%` }} />
                </span>
                <span className="battery-percent">{batteryLevel}%</span>
              </div>
            )}

            {status.connected ? (
              <>
                <IconButton
                  label={syncProgress?.total ? `Syncing data ${syncProgress.completed} of ${syncProgress.total}` : syncing ? 'Starting data sync' : 'Refresh data'}
                  className="refresh-button"
                  onClick={() => runSync()}
                  disabled={syncing}
                >
                  {syncing ? <LoaderCircle className="spin" /> : <RefreshCw />}
                </IconButton>
              </>
            ) : (
              <Button className="connect-button" aria-label={`Connect ${status.provider === 'fitbit-legacy' ? 'Fitbit legacy' : 'Google Health'}`} onClick={connect} disabled={connecting}>
                {connecting ? <LoaderIcon className="spin" /> : <CloudIcon />}<span>Connect</span>
              </Button>
            )}
            </>}
          </div>
        </header>

        <div className="page-content" key={page}>{currentView}</div>
      </SidebarInset>

      {!assistantOpen && page !== 'reports' && page !== 'drinking' && (
        <IconButton
          label={page === 'todos' ? 'Open task assistant' : page === 'habits' ? 'Open habit assistant' : 'Open health assistant'}
          className="assistant-launcher"
          aria-controls="health-assistant"
          aria-expanded={assistantOpen}
          onClick={() => setAssistantOpen(true)}
        >
          <MessageCircle aria-hidden="true" />
        </IconButton>
      )}

      <HealthAssistant
        key={page === 'todos' ? 'tasks' : page === 'habits' ? 'habits' : 'health'}
        onProposals={setProposals}
        open={assistantOpen && page !== 'reports' && page !== 'drinking'}
        data={data}
        page={page}
        onOpenChange={setAssistantOpen}
        onNavigate={navigateFromAssistant}
      />

      <Dialog open={proposals.length > 0} onOpenChange={open => { if (!open) setProposals([]) }}>
        <DialogContent className="todo-dialog"><DialogTitle>Review proposed task changes</DialogTitle><DialogDescription>Nothing changes until you apply. Review every action below.</DialogDescription>
          <div className="todo-proposals">{proposals.map((action, index) => <div key={index}><strong>{action.type}: {action.task?.title || todos.store.tasks.find(t => t.id === action.id)?.title || 'Unknown task'}</strong><pre>{JSON.stringify(action.task || { id: action.id }, null, 2)}</pre></div>)}</div>
          {todos.error && <p role="alert">{todos.error}</p>}
          <Button disabled={todos.busy} onClick={async () => { if (await todos.perform(proposals)) setProposals([]) }}>Apply {proposals.length} changes</Button>
          <Button variant="outline" onClick={() => setProposals([])}>Discard</Button>
        </DialogContent>
      </Dialog>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />

      <SettingsDialog
        open={settingsOpen}
        status={status}
        cloudStatus={cloudStatus}
        connecting={connecting}
        onOpenChange={setSettingsOpen}
        onSave={saveAndConnect}
        onConnect={connect}
        onExport={exportData}
        onDisconnect={disconnect}
        onPairCloud={pairCloud}
        onDisconnectCloud={disconnectCloud}
      />

      {toast && (
        <div className={cn('toast', `toast-${toast.tone}`)} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' ? <CheckIcon /> : toast.tone === 'error' ? <CloseIcon /> : <SparkleIcon />}
          <span>{toast.message}</span>
          <button className="toast-close" aria-label="Close notification" onClick={() => setToast(null)}><CloseIcon /></button>
        </div>
      )}
    </SidebarProvider>
  )
}

function OpenFitSidebar({
  items,
  page,
  userName,
  userAvatar,
  sourceLabel,
  syncStatus,
  onNavigate,
  onSettings,
}: {
  items: typeof navItems
  page: PageId
  userName: string
  userAvatar: string | null
  sourceLabel: string
  syncStatus: { label: string; detail: string; percent: number | null } | null
  onNavigate: (page: PageId) => void
  onSettings: () => void
}) {
  const { setOpenMobile } = useSidebar()
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PB'
  const wellbeingItems = items.filter((item) => item.category !== 'utility' && item.id !== 'devices')
  const dataItem = items.find((item) => item.id === 'devices')

  const selectPage = (nextPage: PageId) => {
    onNavigate(nextPage)
    setOpenMobile(false)
  }

  const openSettings = () => {
    setOpenMobile(false)
    onSettings()
  }

  return (
    <Sidebar collapsible="icon" className="pulse-sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="sidebar-workspace" tooltip="OpenFit" onClick={() => selectPage('today')}>
              <span className="sidebar-workspace-mark">
                <img src="./app-icon.png" alt="" aria-hidden="true" />
              </span>
              <span className="sidebar-workspace-copy">
                <strong>OpenFit</strong>
                <small>Health dashboard</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Wellbeing</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Main navigation">
              {wellbeingItems.map(({ id, label, icon: Icon, category }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    data-category={category}
                    isActive={page === id}
                    tooltip={label}
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => selectPage(id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Utility</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{items.filter(item => item.category === 'utility').sort((a, b) => Number(b.id === 'todos') - Number(a.id === 'todos')).map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={page === item.id} aria-current={page === item.id ? 'page' : undefined} tooltip={item.label} onClick={() => selectPage(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataItem && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    data-category={dataItem.category}
                    isActive={page === dataItem.id}
                    tooltip={dataItem.label}
                    aria-current={page === dataItem.id ? 'page' : undefined}
                    onClick={() => selectPage(dataItem.id)}
                  >
                    <dataItem.icon aria-hidden="true" />
                    <span>{dataItem.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings" onClick={openSettings}>
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {syncStatus && <div className="sidebar-health-sync" role="status" aria-live="polite">
          <LoaderCircle className="spin" aria-hidden="true" />
          <div><strong>{syncStatus.label}</strong><small>{syncStatus.detail}</small>
            <div className={cn('sidebar-sync-progress', syncStatus.percent === null && 'is-indeterminate')} role="progressbar" aria-label="Health sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={syncStatus.percent ?? undefined}><i style={{ width: `${syncStatus.percent ?? 32}%` }} /></div>
          </div>
        </div>}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="sidebar-user" tooltip={userName} onClick={openSettings}>
              <Avatar className="sidebar-user-avatar">
                {userAvatar && <AvatarImage src={userAvatar} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="sidebar-user-copy">
                <strong>{userName}</strong>
                <small>{sourceLabel}</small>
              </span>
              <ChevronsUpDown className="sidebar-switcher-icon" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SettingsDialog({
  open,
  status,
  cloudStatus,
  connecting,
  onOpenChange,
  onSave,
  onConnect,
  onExport,
  onDisconnect,
  onPairCloud,
  onDisconnectCloud,
}: {
  open: boolean
  status: FitbitAuthStatus
  cloudStatus: CloudStatus
  connecting: boolean
  onOpenChange: (open: boolean) => void
  onSave: (config: FitbitConfigInput) => Promise<void>
  onConnect: () => Promise<void>
  onExport: () => Promise<void>
  onDisconnect: () => Promise<void>
  onPairCloud: (apiUrl: string, code: string) => Promise<void>
  onDisconnectCloud: () => Promise<void>
}) {
  const webAccess = useWebAccessActions()
  const [clientId, setClientId] = useState(status.clientId)
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(status.redirectUri)
  const [provider, setProvider] = useState<HealthProvider>(status.provider)
  const [editing, setEditing] = useState(!status.configured)
  const [cloudApiUrl, setCloudApiUrl] = useState(cloudStatus.apiUrl || DEFAULT_CLOUD_API)
  const [pairCode, setPairCode] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setClientId(status.clientId)
    setRedirectUri(status.redirectUri)
    setProvider(status.provider)
    setClientSecret('')
    setEditing(!status.configured)
    setCloudApiUrl(cloudStatus.apiUrl || DEFAULT_CLOUD_API)
    setPairCode('')
  }, [open, status])

  const secretRequired = provider === 'google-health'
  const providerLabel = provider === 'google-health' ? 'Google Health' : 'Fitbit legacy'
  const savedSecretMatchesProvider = status.hasClientSecret && status.provider === provider
  const canSave = status.storageEncrypted
    && clientId.trim().length > 2
    && (!secretRequired || clientSecret.trim().length > 4 || savedSecretMatchesProvider)
    && redirectUri.startsWith('http://127.0.0.1:')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    void onSave({
      provider,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim() || undefined,
      redirectUri: redirectUri.trim(),
    })
  }

  const openDeveloperPortal = () => {
    const url = provider === 'google-health'
      ? 'https://console.cloud.google.com/apis/library/health.googleapis.com'
      : 'https://dev.fitbit.com/apps/new'
    if (window.fitbit) void window.fitbit.openExternal(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const submitPair = async (event: FormEvent) => {
    event.preventDefault()
    if (!cloudApiUrl.trim() || pairCode.trim().length < 4 || cloudBusy) return
    setCloudBusy(true)
    try { await onPairCloud(cloudApiUrl.trim(), pairCode.trim()); setPairCode('') }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Could not pair with Open Gym.') }
    finally { setCloudBusy(false) }
  }

  if (webMode) return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog web-settings-dialog" showCloseButton>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your health connection and OpenFit app.</DialogDescription>
        </DialogHeader>
        <section className="web-settings-section">
          <div className="web-settings-heading"><span>Google Health</span><strong className={status.connected ? 'is-connected' : ''}>{status.connected ? 'Connected' : 'Not connected'}</strong></div>
          <p>Authorize Google Health to sync your activity and health metrics.</p>
          <div className="web-settings-actions">
            <Button onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting…' : status.connected ? 'Reconnect Google Health' : 'Connect Google Health'}</Button>
            {status.connected && <Button variant="outline" onClick={onDisconnect}>Disconnect Google Health</Button>}
          </div>
        </section>
        <section className="web-settings-section">
          <div className="web-settings-heading"><span>OpenFit app</span></div>
          <p>Install OpenFit on this device for quick access from your home screen.</p>
          <Button className="web-settings-install" variant="outline" onClick={() => void webAccess?.install()}>{webAccess?.installPromptAvailable ? 'Install app' : webAccess?.isAndroid ? 'Install on Android' : 'Add to Home Screen'}</Button>
        </section>
        <section className="web-settings-section">
          <div className="web-settings-heading"><span>Health Connect sync</span></div>
          <p>Sync body measurements from your Android phone to your VM.</p>
          <Button className="web-settings-install" variant="outline" asChild><a href="/downloads/openfit-sync-0.1.0.apk" download>Download Android sync app</a></Button>
        </section>
        <div className="web-settings-footer">
          <span>Private workspace · data encrypted on Oracle</span>
          <Button variant="destructive" onClick={() => void webAccess?.signOut()}>Sign out</Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showCloseButton>
        <DialogHeader>
          <div className="dialog-icon"><CloudIcon /></div>
          <DialogTitle>{status.connected && !editing ? `${providerLabel} connected` : `Connect ${providerLabel}`}</DialogTitle>
          <DialogDescription>Google Health credentials stay encrypted on this computer. Health metrics and your OpenFit data sync to your encrypted VM archive.</DialogDescription>
        </DialogHeader>

        {status.connected && !editing ? (
          <div className="connected-state">
            <div className="connection-check"><CheckIcon /></div>
            <div><h3>Sync active</h3><p>Last updated {relativeTime(status.lastSyncAt)}.</p></div>
            <div className="connected-actions">
              <Button onClick={onConnect} disabled={connecting}>{connecting ? <LoaderCircle className="spin" /> : <RefreshCw />} Reauthorize</Button>
              <Button variant="outline" onClick={() => setEditing(true)}><SettingsIcon /> Edit configuration</Button>
              <Button variant="outline" onClick={() => void onExport()}><ExportIcon /> Export data</Button>
              <Button variant="destructive" onClick={() => void onDisconnect()}><DisconnectIcon /> Disconnect and delete local data</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="settings-form">
            <div className="provider-picker" role="radiogroup" aria-label="Health provider">
              <label className={cn(provider === 'google-health' && 'active')}>
                <input className="sr-only" type="radio" name="health-provider" value="google-health" checked={provider === 'google-health'} onChange={() => setProvider('google-health')} />
                <CloudIcon /><span><strong>Google Health</strong><small>API v4 · recommended</small></span>{provider === 'google-health' && <CheckIcon />}
              </label>
              <label className={cn(provider === 'fitbit-legacy' && 'active')}>
                <input className="sr-only" type="radio" name="health-provider" value="fitbit-legacy" checked={provider === 'fitbit-legacy'} onChange={() => setProvider('fitbit-legacy')} />
                <DeviceIcon /><span><strong>Fitbit legacy</strong><small>Temporary compatibility</small></span>{provider === 'fitbit-legacy' && <CheckIcon />}
              </label>
            </div>

            <div className="form-field">
              <Label htmlFor="client-id">OAuth Client ID</Label>
              <Input id="client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
            </div>
            {secretRequired && (
              <div className="form-field">
                <Label htmlFor="client-secret">Client Secret {savedSecretMatchesProvider && <span>· leave blank to keep the current one</span>}</Label>
                <Input id="client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={savedSecretMatchesProvider ? '••••••••••••' : ''} autoComplete="new-password" />
              </div>
            )}
            <div className="form-field">
              <Label htmlFor="callback-url">Callback URL</Label>
              <Input id="callback-url" value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} spellCheck={false} />
              <p>It must exactly match the URL configured in Google Cloud.</p>
            </div>

            <button type="button" className="portal-link" onClick={openDeveloperPortal}>Open developer console <ExternalIcon /></button>
            <div className="scope-note"><ShieldIcon /><p>Read-only permissions for activity, heart, sleep, and authorized measurements.</p></div>

            <DialogFooter className="settings-footer">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!canSave || connecting}>{connecting ? <LoaderIcon className="spin" /> : <CloudIcon />} Save and connect</Button>
            </DialogFooter>
          </form>
        )}
        {window.cloud && <section className="cloud-sync-settings">
          <div className="cloud-sync-heading"><div><strong>Open Gym cloud</strong><p>Bring in gym sessions and match them with your Fitbit recordings. Tasks, habits, and report PDFs also sync to your VM.</p></div>{cloudStatus.configured && <span className="cloud-connected-pill">{cloudStatus.error ? 'Saved · offline' : <><CheckIcon/> Connected</>}</span>}</div>
          {cloudStatus.configured ? <div className="cloud-profile-row">
            <div><strong>{cloudStatus.user?.name || 'Open Gym profile'}</strong><small>{cloudStatus.apiUrl}</small>{cloudStatus.error && <small className="cloud-pair-error">{cloudStatus.error}</small>}</div>
            <Button type="button" variant="outline" onClick={() => void onDisconnectCloud()}>Remove from this device</Button>
          </div> : <form onSubmit={submitPair} className="cloud-pair-form">
            <div className="form-field"><Label htmlFor="openfit-cloud-url">OpenFit cloud API</Label><Input id="openfit-cloud-url" value={cloudApiUrl} onChange={event => setCloudApiUrl(event.target.value)} placeholder="https://api.example.com" spellCheck={false} autoComplete="url"/><p>Use the HTTPS address configured for the OpenFit cloud service.</p></div>
            <div className="form-field"><Label htmlFor="opengym-pair-code">Open Gym pairing code</Label><Input id="opengym-pair-code" value={pairCode} onChange={event => setPairCode(event.target.value.toUpperCase())} placeholder="Code from Settings → Account" autoComplete="one-time-code" maxLength={32}/><p>Generate a code in Open Gym under Settings → Account → Pair the mobile app. It expires after five minutes.</p></div>
            {cloudStatus.error && <p className="cloud-pair-error" role="alert">{cloudStatus.error}</p>}
            <DialogFooter className="settings-footer"><Button type="submit" disabled={cloudBusy || !cloudApiUrl.trim() || pairCode.trim().length < 4}>{cloudBusy ? <LoaderIcon className="spin"/> : <CloudIcon/>} Pair Open Gym</Button></DialogFooter>
          </form>}
          <p className="cloud-privacy-note"><ShieldIcon/> Health metrics sync encrypted to your VM. Google credentials and GPS route files stay on this device.</p>
        </section>}
      </DialogContent>
    </Dialog>
  )
}
