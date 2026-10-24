/// <reference types="vite/client" />

import type { FitbitBridge, CloudBridge, HealthAssistantBridge, TodoBridge, HabitBridge, ReaderBridge, ReportsBridge } from './types'

declare global {
  interface Window {
    reports?: ReportsBridge
    reader?: ReaderBridge
    habits?: HabitBridge
    todos?: TodoBridge
    fitbit?: FitbitBridge
    cloud?: CloudBridge
    healthAssistant?: HealthAssistantBridge
  }
}

export {}
