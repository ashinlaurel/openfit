export type PageId = 'today' | 'drinking' | 'movement' | 'activity' | 'gym' | 'health' | 'sleep' | 'body' | 'devices' | 'todos' | 'habits' | 'reader' | 'reports'

import type { WorkoutLinks, WorkoutLinkInput } from './lib/gym-sync'

export type DataSource = 'demo' | 'fitbit' | 'google-health' | 'cache'

export type HealthProvider = 'google-health' | 'fitbit-legacy'

export interface TimePoint {
  time: string
  value: number
}

export interface TrendPoint {
  date: string
  label: string
  steps: number | null
  calories: number | null
  distanceKm: number | null
  floors: number | null
  activeMinutes: number | null
  zoneMinutes: number | null
  sedentaryMinutes: number | null
  restingHeartRate: number | null
  hrvMs: number | null
  breathingRate: number | null
  spo2: number | null
  skinTemperature: number | null
  coreTemperature: number | null
  cardioScore: number | null
  sleepMinutes: number | null
  sleepScore: number | null
  sleepEfficiency: number | null
  sleepTimeInBed?: number | null
  weight: number | null
  bodyFat: number | null
  waterMl: number | null
  caloriesIn: number | null
}

export interface WorkoutSplit {
  startTime: string | null
  endTime: string | null
  activeMinutes: number | null
  elapsedMinutes: number | null
  distanceKm: number | null
  calories: number | null
  averageHeartRate: number | null
  paceSecondsPerMeter: number | null
  type: string | null
}
export interface ActivityItem {
  exerciseType?: string | null
  startTime?: string | null
  endTime?: string | null
  activeDurationMinutes?: number | null
  elapsedDurationMinutes?: number | null
  averageSpeedKmh?: number | null
  elevationGainMeters?: number | null
  runVo2Max?: number | null
  swimLengths?: number | null
  poolLengthMeters?: number | null
  hasGps?: boolean | null
  notes?: string | null
  sourceDevice?: string | null
  splits?: WorkoutSplit[]
  events?: Array<{ time: string; type: string }>

  id: string
  name: string
  date: string
  time: string
  durationMinutes: number
  calories: number | null
  distanceKm: number | null
  averageHeartRate: number | null
  zoneMinutes: number | null
  steps: number | null
  averagePaceSecondsPerMeter: number | null
  heartZoneMinutes: HeartZoneMinutes | null
}

export type SleepStageKey = 'deep' | 'light' | 'rem' | 'wake'

export interface HeartZoneMinutes {
  light: number | null
  moderate: number | null
  vigorous: number | null
  peak: number | null
}

export interface SleepStage {
  name: 'Deep' | 'Light' | 'REM' | 'Awake'
  key: SleepStageKey
  minutes: number
  color: string
}

export interface SleepStageSegment {
  startTime: string
  endTime: string
  type: SleepStageKey
}

export interface SleepStageCounts {
  deep: number | null
  light: number | null
  rem: number | null
  wake: number | null
}

export interface DashboardData {
  source: DataSource
  selectedDate: string
  generatedAt: string
  profile: {
    displayName: string
    avatar: string | null
    memberSince: string | null
    timezone: string | null
  }
  device: {
    id: string | null
    name: string
    type: string | null
    battery: string | null
    batteryLevel: number | null
    lastSyncTime: string | null
    firmware: string | null
    features: string[]
  } | null
  activity: {
    steps: number | null
    stepsGoal: number | null
    calories: number | null
    caloriesGoal: number | null
    distanceKm: number | null
    distanceGoalKm: number | null
    floors: number | null
    floorsGoal: number | null
    activeMinutes: number | null
    lightActiveMinutes: number | null
    moderateActiveMinutes: number | null
    vigorousActiveMinutes: number | null
    activeMinutesGoal: number | null
    zoneMinutes: number | null
    sedentaryMinutes: number | null
    sedentaryIntervals?: Array<{ startTime: string; endTime: string }>
    stepsIntraday: TimePoint[]
    caloriesIntraday: TimePoint[]
  }
  health: {
    currentHeartRate: number | null
    restingHeartRate: number | null
    heartRateMin: number | null
    heartRateMax: number | null
    heartRateSamples?: Array<{ timestamp: string; value: number }>
    heartRateIntraday: TimePoint[]
    hrvMs: number | null
    hrvDeepSleepRmssdMs: number | null
    hrvEntropy: number | null
    nonRemHeartRate: number | null
    breathingRate: number | null
    spo2: number | null
    spo2Min: number | null
    spo2Max: number | null
    skinTemperature: number | null
    skinNightlyTemperatureCelsius: number | null
    skinBaselineTemperatureCelsius: number | null
    skinTemperatureStddev30dCelsius: number | null
    coreTemperature: number | null
    vo2Max: string | null
    cardioScore: number | null
    ecgClassification: string | null
    bloodGlucoseMgDl: number | null
    irregularRhythmAlerts: number | null
  }
  sleep: {
    totalMinutes: number | null
    goalMinutes: number | null
    score: number | null
    efficiency: number | null
    startTime: string | null
    endTime: string | null
    stages: SleepStage[]
    stageTimeline: SleepStageSegment[]
    stageTransitions: SleepStageCounts
    minutesToFallAsleep: number | null
    minutesAfterWakeUp: number | null
    timeInBed: number | null
    minutesAwake: number | null
  }
  body: {
    weightKg: number | null
    weightGoalKg: number | null
    bmi: number | null
    bodyFat: number | null
    waterMl: number | null
    waterGoalMl: number | null
    caloriesIn: number | null
  }
  trends: TrendPoint[]
  workoutCoverage?: { startDate: string; endDate: string } | null
  activities: ActivityItem[]
  insights: Array<{
    id: string
    tone: 'mint' | 'blue' | 'amber' | 'violet'
    title: string
    body: string
  }>
  sync: {
    endpointCount: number
    successCount: number
    errors: Array<{ key: string; message: string }>
    rateLimitRemaining: number | null
  }
}

export interface RawFitbitPayload {
  source: 'fitbit' | 'google-health'
  date: string
  generatedAt: string
  cacheHit?: boolean
  endpoints: Record<string, unknown>
  errors: Array<{ key: string; message: string; status?: number }>
  rateLimit: {
    limit: number | null
    remaining: number | null
    resetSeconds: number | null
  }
  requestStats?: {
    total: number
    succeeded: number
    successfulKeys?: string[]
  }
}

export interface RawHealthArchive {
  version: number
  lastDate: string | null
  days: Record<string, RawFitbitPayload>
}

export interface FitbitAuthStatus {
  isElectron: boolean
  configured: boolean
  connected: boolean
  clientId: string
  redirectUri: string
  hasClientSecret: boolean
  storageEncrypted: boolean
  lastSyncAt: string | null
  provider: HealthProvider
}

export interface FitbitConfigInput {
  provider: HealthProvider
  clientId: string
  clientSecret?: string
  redirectUri: string
}

export interface FitbitBridge {
  getStatus: () => Promise<FitbitAuthStatus>
  saveConfig: (config: FitbitConfigInput) => Promise<FitbitAuthStatus>
  connect: () => Promise<{ ok: boolean; message?: string }>
  disconnect: () => Promise<FitbitAuthStatus>
  sync: (date: string) => Promise<RawFitbitPayload>
  getCachedData: (date?: string) => Promise<RawFitbitPayload | null>
  getCachedArchive: () => Promise<RawHealthArchive>
  exportData: () => Promise<{ canceled: boolean; path?: string }>
  openExternal: (url: string) => Promise<void>
  onAuthComplete: (callback: (result: { ok: boolean; error?: string }) => void) => () => void
  onSyncProgress: (callback: (progress: { completed: number; total: number; key: string; date?: string }) => void) => () => void
}

export interface CloudStatus {
  configured: boolean
  apiUrl: string
  user: { id: string; name: string } | null
  error?: string
}
export interface CloudBridge {
  getStatus: () => Promise<CloudStatus>
  pair: (apiUrl: string, code: string) => Promise<CloudStatus>
  disconnect: () => Promise<CloudStatus>
  getOpenGym: () => Promise<{ state: Record<string, unknown> | null; rev: number; exerciseNames?: Record<string, string>; syncedAt?: string; fromCache?: boolean; syncError?: string }>
  getWorkoutLinks: () => Promise<WorkoutLinks>
  saveWorkoutLink: (input: WorkoutLinkInput) => Promise<WorkoutLinks>
  getArchive: () => Promise<{ archive: { version: 1; todos: TodoArchive; habits: HabitArchive; reports: ReportArchive }; rev: number }>
  saveArchive: (archive: { version: 1; todos: TodoArchive; habits: HabitArchive; reports: ReportArchive }, baseRev: number) => Promise<{ archive: unknown; rev: number }>
  getPdf: (hash: string) => Promise<string>
  savePdf: (hash: string, base64: string) => Promise<void>
  deletePdf: (hash: string) => Promise<void>
  onSync: (callback: (result: { ok: boolean; error?: string; rev?: number; at?: string }) => void) => () => void
}

export interface HealthAssistantStatus {
  available: boolean
  connected: boolean
  authenticated: boolean
  version: string | null
  error?: string
}

export type HealthAssistantEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | { requestId: string; type: 'complete'; text?: string }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }

export interface HealthAssistantBridge {
  getStatus: () => Promise<HealthAssistantStatus>
  startTurn: (input: {
    requestId: string
    message: string
    healthContext: string
    scope?: 'todos' | 'habits' | 'health'
  }) => Promise<{ requestId: string }>
  cancel: (requestId: string) => Promise<void>
  reset: () => Promise<void>
  onEvent: (callback: (event: HealthAssistantEvent) => void) => () => void
}

export interface TodoTask {
  id: string
  title: string
  notes: string
  due: string
  priority: 'low' | 'normal' | 'high'
  tags: string[]
  state: 'active' | 'completed' | 'trashed'
  createdAt: string
  updatedAt: string
  completedAt: string | null
  trashedAt: string | null
  history: Array<{ at: string; actor: string; action: string; before?: { title: string; notes: string; due: string; priority: string; tags: string[]; state: string } }>
}
export interface TodoArchive { version: 1; tasks: TodoTask[] }
export interface TodoAction { type: 'create' | 'update' | 'complete' | 'reopen' | 'trash' | 'restore' | 'purge'; id?: string; task?: Partial<TodoTask>; actor?: 'user' | 'assistant' }
export interface TodoBridge {
  load: () => Promise<TodoArchive>
  mutate: (action: TodoAction) => Promise<TodoArchive>
  batch: (actions: TodoAction[]) => Promise<TodoArchive>
  recover: () => Promise<TodoArchive>
  export: () => Promise<void>
  import: () => Promise<TodoArchive>
}

export type HabitColor = 'mint' | 'blue' | 'violet' | 'amber' | 'rose'
export type HabitIcon = 'spark' | 'book' | 'move' | 'water' | 'moon' | 'mind' | 'sun' | 'leaf'
export interface HabitFields { title: string; note: string; color: HabitColor; icon: HabitIcon; days: number[] }
export interface Habit extends HabitFields {
  id: string
  createdDate: string
  createdAt: string
  updatedAt: string
  archived: boolean
  schedules: Array<{ from: string; days: number[] }>
  checkins: Record<string, { at: string }>
  history: Array<{ at: string; action: string; date?: string }>
}
export interface HabitArchive { version: 1; habits: Habit[] }
export type HabitAction = { type: 'create' | 'update'; id?: string; habit: HabitFields } | { type: 'checkin'; id: string; date: string } | { type: 'archive' | 'restore'; id: string }
export interface HabitBridge {
  load: () => Promise<HabitArchive>
  mutate: (action: HabitAction) => Promise<HabitArchive>
  export: () => Promise<void>
  recover: () => Promise<HabitArchive>
}

export interface ReaderBlock { type: 'paragraph' | 'heading' | 'quote' | 'code'; text: string }
export type ReaderArticleState = 'unread' | 'reading' | 'finished' | 'archived'
export interface ReaderArticle {
  id: string; url: string; title: string; siteName: string; author: string; excerpt: string
  publishedAt: string | null; addedAt: string; updatedAt: string; lastReadAt: string | null; fetchedAt: string | null
  feedIds: string[]; saved: boolean; starred: boolean; state: ReaderArticleState; progress: number; tags: string[]
  blocks: ReaderBlock[]; contentStatus: 'pending' | 'ready' | 'unavailable'; fetchError: string
  wordCount: number | null; readingMinutes: number | null
}
export interface ReaderFeed { id: string; url: string; title: string; addedAt: string; lastFetchedAt: string | null; error: string }
export interface ReaderArchive { version: 1; articles: ReaderArticle[]; feeds: ReaderFeed[] }
export type ReaderAction = { type: 'update'; id: string; patch: Partial<Pick<ReaderArticle, 'state' | 'saved' | 'starred' | 'progress' | 'tags'>> } | { type: 'unsubscribe'; id: string }
export interface ReaderBridge {
  load: () => Promise<ReaderArchive>
  save: (url: string) => Promise<{ store: ReaderArchive; articleId: string }>
  subscribe: (url: string) => Promise<ReaderArchive>
  refresh: (id?: string) => Promise<ReaderArchive>
  fetchArticle: (id: string) => Promise<ReaderArchive>
  mutate: (action: ReaderAction) => Promise<ReaderArchive>
  export: () => Promise<void>
  recover: () => Promise<ReaderArchive>
}

export interface ReportObservation {
  sourceReferenceText?: string; referenceDefault?: boolean
  key: string; label: string; group: string; valueText: string; value: number | null; qualifier: string
  unit: string; referenceText: string; low: number | null; high: number | null; lowInclusive: boolean; highInclusive: boolean
  page: number; sourceText: string; method: 'text' | 'ocr' | 'codex' | 'manual'; needsReview: boolean
}
export interface MedicalReport {
  id: string; hash: string; fileName: string; title: string; date: string; pageCount: number
  observations: ReportObservation[]; archived: boolean; importedAt: string; updatedAt: string
}
export type ReportReference = Pick<ReportObservation,'referenceText'|'low'|'high'|'lowInclusive'|'highInclusive'>
export interface ReportArchive { version: 1; reports: MedicalReport[]; referenceDefaults?: Record<string,ReportReference> }
export interface ReportDraft {
  id: string; fileName: string; title: string; detectedDate: string; pageCount: number; existingId: string | null
  observations: ReportObservation[]; warnings: string[]
}
export interface ReportSaveInput { title: string; date: string; observations: ReportObservation[]; confirmed: boolean }
export interface ReportProgress { page: number; total: number; stage: 'text' | 'ocr' }
export interface ReportsBridge {
  load: () => Promise<ReportArchive>
  choose: () => Promise<ReportDraft | null>
  edit: (id: string) => Promise<ReportDraft>
  ocr: (id: string) => Promise<ReportDraft>
  assist: (id: string) => Promise<ReportDraft>
  cancel: () => Promise<void>
  discard: (id: string) => Promise<void>
  save: (id: string, input: ReportSaveInput) => Promise<ReportArchive>
  archive: (id: string, archived: boolean) => Promise<ReportArchive>
  preview: (input: {draftId?:string;reportId?:string;page:number}) => Promise<{image:string}>
  export: () => Promise<void>
  recover: () => Promise<ReportArchive>
  onProgress: (callback: (progress: ReportProgress) => void) => () => void
}
