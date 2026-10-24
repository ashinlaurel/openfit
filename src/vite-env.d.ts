/// <reference types="vite/client" />

import type { FitbitBridge, CloudBridge, HealthAssistantBridge, TodoBridge, HabitBridge, ReaderBridge, ReportsBridge } from './types'
import type { DrinkingStore } from './lib/drinking'

declare global {
  interface Window {
    drinking?: { load: () => Promise<DrinkingStore>; save: (store: DrinkingStore) => Promise<DrinkingStore> }
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
