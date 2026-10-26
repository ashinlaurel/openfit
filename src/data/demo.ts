import { indiaDate, APP_TIME_ZONE } from '../lib/timezone'
import type { ActivityItem, DashboardData, SleepStage, SleepStageKey, SleepStageSegment, SleepSession, TimePoint, TrendPoint } from '../types'

const dayMs = 86_400_000

const localIso = indiaDate

function dateFromIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function seeded(index: number, salt: number) {
  return Math.sin(index * 12.9898 + salt * 78.233) * 0.5 + 0.5
}

function makeTrends(selectedDate: string): TrendPoint[] {
  const end = dateFromIso(selectedDate)
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: APP_TIME_ZONE })
  return Array.from({ length: 30 }, (_, offsetIndex) => {
    const index = offsetIndex - 16
    const date = new Date(end.getTime() - (29 - offsetIndex) * dayMs)
    const activityWave = Math.sin(index * 0.9) * 1_350
    const steps = Math.round(7_200 + activityWave + seeded(index, 2) * 3_100)
    const sleep = makeDemoSleep(localIso(date))
    const sleepDay = Math.floor(Date.parse(`${localIso(date)}T12:00:00Z`) / dayMs)
    const sleepMinutes = sleep.totalMinutes
    const activeMinutes = Math.round(38 + seeded(index, 5) * 48)
    return {
      date: localIso(date),
      label: formatter.format(date).replace('.', ''),
      steps,
      calories: Math.round(1_750 + steps * 0.055),
      distanceKm: Number((steps * 0.00079).toFixed(2)),
      floors: Math.round(5 + seeded(index, 9) * 11),
      activeMinutes,
      lightActiveMinutes: Math.round(90 + seeded(sleepDay, 5) * 120),
      moderateActiveMinutes: Math.max(0, activeMinutes - 22), vigorousActiveMinutes: 22,
      activeCalories: Math.round(200 + seeded(sleepDay, 8) * 450),
      zoneMinutes: Math.round(activeMinutes * (0.72 + seeded(index, 10) * 0.45)),
      sedentaryMinutes: Math.round(480 + seeded(index, 11) * 130),
      restingHeartRate: Math.round(59 + seeded(index, 6) * 7),
      hrvMs: Math.round(42 + seeded(sleepDay, 12) * 14),
      breathingRate: Number((14.1 + seeded(sleepDay, 13) * 1.5).toFixed(1)),
      spo2: Number((96.2 + seeded(sleepDay, 14) * 1.6).toFixed(1)),
      skinTemperature: Number((-0.35 + seeded(sleepDay, 15) * 0.7).toFixed(1)),
      coreTemperature: null,
      cardioScore: Math.round(49 + seeded(index, 16) * 5),
      sleepMinutes,
      sleepScore: null,
      sleepEfficiency: sleep.efficiency,
      sleepTimeInBed: sleep.timeInBed,
      sleepStartTime: sleep.startTime, sleepEndTime: sleep.endTime,
      sleepStageTimeline: sleep.stageTimeline,
      weight: Number((72.8 - index * 0.045 + seeded(index, 3) * 0.28).toFixed(1)),
      bodyFat: Number((16.9 - index * 0.012 + seeded(index, 18) * 0.4).toFixed(1)),
      waterMl: Math.round(1_650 + seeded(index, 19) * 850),
      caloriesIn: Math.round(1_720 + seeded(index, 20) * 520),
    }
  })
}

function makeHeartSeries(): TimePoint[] {
  return Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2)
    const minutes = index % 2 ? '30' : '00'
    const base = hours < 7 ? 58 : hours < 17 ? 74 : 69
    const training = hours === 18 || hours === 19 ? 55 * Math.sin(((index - 35) / 8) * Math.PI) : 0
    return {
      time: `${String(hours).padStart(2, '0')}:${minutes}`,
      value: Math.round(base + Math.sin(index * 0.7) * 5 + Math.max(0, training)),
    }
  })
}

function makeStepsSeries(): TimePoint[] {
  const values = [0, 0, 0, 0, 0, 0, 45, 420, 510, 180, 230, 340, 680, 320, 210, 460, 290, 370, 1720, 1420, 610, 280, 90, 18]
  return values.map((value, index) => ({
    time: `${String(index).padStart(2, '0')}:00`,
    value,
  }))
}

function makeDemoSleep(date: string): SleepSession {
  const epoch = Math.floor(Date.parse(`${date}T12:00:00Z`) / dayMs)
  const asleep = Math.round(390 + seeded(epoch, 4) * 85), awake = Math.round(22 + seeded(epoch, 8) * 24)
  const start = Date.parse(`${date}T00:00:00+05:30`) - (20 + Math.round(seeded(epoch, 9) * 70)) * 60000
  const sequence: Array<[SleepStageKey, number]> = [
    ['light', 25], ['deep', 35], ['light', 42], ['rem', 18], ['wake', 5],
    ['light', 35], ['deep', 30], ['light', 40], ['rem', 28], ['wake', 8],
    ['light', 36], ['deep', 16], ['light', 40], ['rem', 25], ['wake', 10], ['rem', 25], ['wake', 15],
  ]
  let cursor = start, asleepUsed = 0, awakeUsed = 0
  const timeline: SleepStageSegment[] = sequence.map(([type, weight], i) => {
    const wake = type === 'wake'
    const target = wake ? awake : asleep, denominator = wake ? 38 : 395
    const last = wake ? i === 16 : i === 15
    const minutes = last ? target - (wake ? awakeUsed : asleepUsed) : Math.round(weight / denominator * target)
    if (wake) awakeUsed += minutes; else asleepUsed += minutes
    const startTime = new Date(cursor).toISOString(); cursor += minutes * 60000
    return { type, startTime, endTime: new Date(cursor).toISOString() }
  })
  const stages: SleepStage[] = (['deep', 'light', 'rem', 'wake'] as const).map(key => ({
    key, name: key === 'rem' ? 'REM' : key === 'wake' ? 'Awake' : key === 'deep' ? 'Deep' : 'Light', color: `var(--sleep-${key})`,
    minutes: timeline.filter(s => s.type === key).reduce((sum, s) => sum + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000, 0),
  }))
  return {
    id: `demo-main-${date}`, isMainSleep: true, isNap: false, processed: true, stagesStatus: 'SUCCEEDED', manuallyEdited: false, sleepType: 'STAGES',
    totalMinutes: asleep, score: null, efficiency: Math.round(asleep / (asleep + awake) * 100),
    startTime: timeline[0].startTime, endTime: timeline.at(-1)!.endTime, stages, stageTimeline: timeline,
    stageTransitions: { deep: 3, light: 6, rem: 4, wake: 4 }, minutesToFallAsleep: null, minutesAfterWakeUp: null,
    timeInBed: asleep + awake, minutesAwake: awake,
    outOfBedSegments: [{ startTime: timeline[9].startTime, endTime: timeline[9].endTime }],
  }
}

function makeActivities(selectedDate: string): ActivityItem[] {
  const result: ActivityItem[] = []
  for (let offset = 0; offset < 28; offset++) {
    const date = new Date(Date.parse(`${selectedDate}T12:00:00Z`) - offset * dayMs).toISOString().slice(0, 10)
    const epoch = Math.floor(Date.parse(`${date}T12:00:00Z`) / dayMs), weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const kinds = weekday === 1 ? ['run', 'walk'] : weekday === 2 ? ['strength'] : weekday === 3 ? ['run'] : weekday === 5 ? ['walk'] : weekday === 6 ? [epoch % 2 ? 'strength' : 'swim'] : []
    for (const kind of kinds) {
      const run = kind === 'run', walk = kind === 'walk', swim = kind === 'swim'
      const duration = run ? 34 + epoch % 10 : walk ? 20 + epoch % 9 : swim ? 30 + epoch % 6 : 40 + epoch % 13
      const distance = run ? 5.8 + epoch % 8 * .13 : walk ? 1.5 + epoch % 7 * .08 : swim ? 1.2 : null
      const time = run ? '18:24' : walk ? '12:46' : swim ? '08:30' : '19:08'
      const pause = run && epoch % 2 ? 3 : 0
      const start = `${date}T${time}:00+02:00`, startMs = Date.parse(start), end = new Date(startMs + (duration + pause) * 60000).toISOString()
      const pace = distance ? duration * 60 / (distance * 1000) : null
      const heart = run ? 140 + epoch % 15 : walk ? 95 + epoch % 12 : swim ? 112 + epoch % 9 : 120 + epoch % 15
      const parts = run && distance ? Array.from({length:Math.ceil(distance)}, (_,i) => Math.min(1,distance-i)) : []
      const weights = parts.map((d,i) => d * (1 + Math.sin(i + epoch) * .06)), weightSum = weights.reduce((a,b)=>a+b,0)
      let cursor = startMs
      const splits = parts.map((d,i) => {
        const active = duration * weights[i] / weightSum, elapsed = active + pause * d / distance!
        const from = new Date(cursor).toISOString(); cursor += elapsed * 60000
        return {startTime:from,endTime:new Date(cursor).toISOString(),activeMinutes:active,elapsedMinutes:elapsed,distanceKm:d,calories:null,averageHeartRate:heart + i - 2,paceSecondsPerMeter:active * 60 / (d * 1000),type:'DISTANCE'}
      })
      result.push({
        id:`${kind}-demo-${date}`, name:run?'Outdoor run':walk?'Walk':swim?'Pool swim':'Functional training',
        exerciseType:run?'RUNNING':walk?'WALKING':swim?'SWIMMING_POOL':'STRENGTH_TRAINING', date,time,startTime:start,endTime:end,
        durationMinutes:duration,activeDurationMinutes:duration,elapsedDurationMinutes:duration+pause,
        calories:Math.round(duration * (run?10.5:walk?4.7:swim?7:6.4)),distanceKm:distance,averageHeartRate:heart,
        zoneMinutes:run?duration+12:walk?8:swim?duration:duration-5,steps:run?Math.round(distance!*1250):walk?Math.round(distance!*1300):null,
        averagePaceSecondsPerMeter:pace,averageSpeedKmh:distance?distance/(duration/60):null,
        elevationGainMeters:run&&epoch%3===0?18+epoch%12:null,runVo2Max:run&&epoch%4===0?44.5:null,
        swimLengths:swim?48:null,poolLengthMeters:swim?25:null,hasGps:null,sourceDevice:'Google Fitbit Air',
        notes:run&&epoch%3===0?'Comfortable pace. Kept the first kilometre easy.':null,
        heartZoneMinutes:walk?{light:duration-8,moderate:8,vigorous:0,peak:0}:run?{light:6,moderate:10,vigorous:duration-20,peak:4}:{light:10,moderate:duration-15,vigorous:5,peak:0},
        splits,events:pause?[{time:new Date(startMs+duration/2*60000).toISOString(),type:'PAUSE'},{time:new Date(startMs+(duration/2+pause)*60000).toISOString(),type:'RESUME'}]:[],
      })
    }
  }
  return result.sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
}

export function createDemoData(selectedDate = localIso()): DashboardData {
  const trends = makeTrends(selectedDate)
  const latest = trends.at(-1)!
  const sleep = makeDemoSleep(selectedDate)
  const latestSteps = latest.steps ?? 0
  const latestSleepMinutes = latest.sleepMinutes ?? 0
  const stepsIntraday = makeStepsSeries()
  const heartRateIntraday = makeHeartSeries()
  const activities = makeActivities(selectedDate)

  return {
    source: 'demo',
    selectedDate,
    generatedAt: new Date().toISOString(),
    profile: {
      displayName: 'Flavio',
      avatar: null,
      memberSince: '2021-03-12',
      timezone: APP_TIME_ZONE,
    },
    device: {
      id: 'demo-tracker',
      name: 'Google Fitbit Air',
      type: 'SCREENLESS FITNESS TRACKER',
      battery: 'High',
      batteryLevel: 82,
      lastSyncTime: new Date(Date.now() - 6 * 60_000).toISOString(),
      firmware: '20001.194.91',
      features: ['STEPS', 'HEART_RATE', 'SLEEP', 'SPO2', 'SKIN_TEMPERATURE', 'ACTIVE_ZONE_MINUTES'],
    },
    activity: {
      historyTrends: trends, activeCalories: latest.activeCalories,
      intensityIntervals: [
        { startTime: `${selectedDate}T08:00:00+05:30`, endTime: `${selectedDate}T08:25:00+05:30`, level: 'light' },
        { startTime: `${selectedDate}T12:10:00+05:30`, endTime: `${selectedDate}T12:25:00+05:30`, level: 'moderate' },
        { startTime: `${selectedDate}T18:05:00+05:30`, endTime: `${selectedDate}T18:25:00+05:30`, level: 'vigorous' },
      ],
      distanceIntervals: Array.from({length:24}, (_,h) => ({startTime:`${selectedDate}T${String(h).padStart(2,'0')}:00:00+05:30`,endTime:new Date(Date.parse(`${selectedDate}T${String(h).padStart(2,'0')}:00:00+05:30`)+3600000).toISOString(),value: (makeStepsSeries()[h].value)*.00079})),
      zoneIntervals: [{ startTime:`${selectedDate}T12:10:00+05:30`,endTime:`${selectedDate}T12:25:00+05:30`,value:15 }],
      steps: latest.steps,
      stepsGoal: 10_000,
      calories: latest.calories,
      caloriesGoal: 2_450,
      distanceKm: latest.distanceKm,
      distanceGoalKm: 8,
      floors: latest.floors,
      floorsGoal: 10,
      activeMinutes: latest.activeMinutes,
      lightActiveMinutes: latest.lightActiveMinutes ?? null,
      moderateActiveMinutes: Math.max(0, (latest.activeMinutes ?? 0) - 22),
      vigorousActiveMinutes: 22,
      activeMinutesGoal: 60,
      zoneMinutes: latest.zoneMinutes,
      sedentaryMinutes: latest.sedentaryMinutes,
      sedentaryIntervals: [[9, 0, 10, 12], [10, 25, 11, 5], [11, 20, 12, 40], [14, 0, 15, 18], [15, 35, 16, 12], [16, 40, 17, 45]].map(([h, m, eh, em]) => ({ startTime: `${selectedDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, endTime: `${selectedDate}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00` })),
      stepsIntraday,
      caloriesIntraday: stepsIntraday.map((point, index) => ({
        time: point.time,
        value: Math.round(62 + point.value * 0.055 + Math.sin(index) * 5),
      })),
    },
    health: {
      currentHeartRate: 72,
      restingHeartRate: latest.restingHeartRate,
      heartRateMin: 53,
      heartRateMax: 171,
      heartRateSamples: activities.flatMap((item, index) => Array.from({length:Math.ceil(item.elapsedDurationMinutes || 0)}, (_,i) => ({ timestamp:new Date(Date.parse(item.startTime!) + i*60000).toISOString(), value:Math.round((item.averageHeartRate || 100) - 12 + Math.min(12,i*.9) + Math.sin(i*.6+index)*9) })).filter((_,i)=>i<9 || i>12)),
      heartRateIntraday,
      hrvMs: latest.hrvMs,
      hrvDeepSleepRmssdMs: (latest.hrvMs ?? 0) + 7,
      hrvEntropy: 3.61,
      nonRemHeartRate: 57,
      breathingRate: latest.breathingRate,
      spo2: latest.spo2,
      spo2Min: (latest.spo2 ?? 97) - 1.8,
      spo2Max: Math.min(100, (latest.spo2 ?? 97) + 1.1),
      skinTemperature: latest.skinTemperature,
      skinNightlyTemperatureCelsius: 33.55 + (latest.skinTemperature ?? 0),
      skinBaselineTemperatureCelsius: 33.55,
      skinTemperatureStddev30dCelsius: 0.13,
      coreTemperature: null,
      vo2Max: '49–53',
      cardioScore: latest.cardioScore,
      ecgClassification: 'Ritmo sinusale',
      bloodGlucoseMgDl: null,
      irregularRhythmAlerts: 0,
    },
    sleep: {
      details: {
        hrv: Array.from({ length: Math.floor(sleep.timeInBed! / 5) }, (_, i) => ({ timestamp: new Date(Date.parse(sleep.startTime!) + i * 5 * 60000).toISOString(), value: Math.round((latest.hrvMs ?? 45) + Math.sin(i * .3) * 8) })).filter((_, i) => i < 30 || i > 36),
        spo2: Array.from({ length: Math.floor(sleep.timeInBed!) }, (_, i) => ({ timestamp: new Date(Date.parse(sleep.startTime!) + i * 60000).toISOString(), value: Number(Math.min(100, (latest.spo2 ?? 97) + Math.sin(i * .13) * .8).toFixed(1)) })).filter((_, i) => i < 120 || i > 135),
        breathing: [{ timestamp: sleep.endTime!, full: latest.breathingRate, deep: 13.8, light: 14.4, rem: 15.1 }],
      },
      ...sleep, historyTrends: trends, goalMinutes: 480, mainSessionId: sleep.id,
      sessions: [sleep, {
        ...sleep, id: `demo-nap-${selectedDate}`, isMainSleep: false, isNap: true, sleepType: 'CLASSIC', stagesStatus: 'REJECTED_NAP',
        totalMinutes: 24, timeInBed: 27, minutesAwake: 3, efficiency: 89,
        startTime: `${selectedDate}T14:10:00+05:30`, endTime: `${selectedDate}T14:37:00+05:30`,
        stages: [], stageTimeline: [], stageTransitions: { deep: null, light: null, rem: null, wake: null }, outOfBedSegments: [],
      }],
    },
    body: {
      weightKg: latest.weight,
      weightGoalKg: 71.5,
      bmi: 22.6,
      bodyFat: latest.bodyFat,
      waterMl: latest.waterMl,
      waterGoalMl: 2_500,
      caloriesIn: latest.caloriesIn,
    },
    trends: trends.slice(-14),
    workoutCoverage: {startDate:new Date(Date.parse(`${selectedDate}T12:00:00Z`)-27*dayMs).toISOString().slice(0,10),endDate:selectedDate},
    activities,
    insights: [
      {
        id: 'activity',
        tone: 'mint',
        title: latestSteps >= 10_000 ? 'Step goal reached' : 'Movement recorded',
        body: latestSteps >= 10_000
          ? 'You exceeded your personal goal of 10,000 steps.'
          : `You are ${(10_000 - latestSteps).toLocaleString('en-US')} steps away from your personal goal.`,
      },
      {
        id: 'sleep',
        tone: 'violet',
        title: 'Sleep duration',
        body: `${latestSleepMinutes < 480 ? `${480 - latestSleepMinutes} minutes short` : 'Goal reached'} compared with your personal goal.`,
      },
      {
        id: 'heart',
        tone: 'blue',
        title: 'Resting heart rate detected',
        body: `${latest.restingHeartRate} bpm: compare it with your personal trend, not with a single day.`,
      },
    ],
    sync: {
      endpointCount: 25,
      successCount: 25,
      errors: [],
      rateLimitRemaining: 126,
    },
  }
}

export { localIso }
