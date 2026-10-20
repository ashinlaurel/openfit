import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { __test } = require('./google-health-service.cjs') as {
  __test: { translateGoogleHealth: (raw: Record<string, any>, date: string) => Record<string, any> }
}

const civil = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return { date: { year, month, day }, time: {} }
}

const daily = (date: string, value: Record<string, unknown>) => ({ civilStartTime: civil(date), civilEndTime: civil(date), ...value })

describe('Google Health adapter', () => {
  it('translates Google Health v4 payloads into the shared dashboard contract', () => {
    const endpoints = __test.translateGoogleHealth({
      userInfo: { name: 'Ada', picture: 'https://example.test/avatar.png' },
      profileRaw: { membershipStartDate: { year: 2024, month: 1, day: 2 } },
      settingsRaw: { timeZone: 'Europe/Rome' },
      devicesRaw: { pairedDevices: [{ name: 'users/me/pairedDevices/air', deviceType: 'TRACKER', deviceVersion: 'Google Fitbit Air', batteryLevel: 88 }] },
      stepsDaily: { rollupDataPoints: [daily('2026-06-22', { steps: { countSum: '8450' } })] },
      caloriesDaily: { rollupDataPoints: [daily('2026-06-22', { totalCalories: { kcalSum: 2200 } })] },
      distanceDaily: { rollupDataPoints: [daily('2026-06-22', { distance: { millimetersSum: '6500000' } })] },
      floorsDaily: { rollupDataPoints: [daily('2026-06-22', { floors: { countSum: '9' } })] },
      activeMinutesDaily: { rollupDataPoints: [daily('2026-06-22', { activeMinutes: { activeMinutesRollupByActivityLevel: [
        { activityLevel: 'LIGHT', activeMinutesSum: '41' },
        { activityLevel: 'MODERATE', activeMinutesSum: '12' },
        { activityLevel: 'VIGOROUS', activeMinutesSum: '22' },
      ] } })] },
      zoneMinutesDaily: { rollupDataPoints: [daily('2026-06-22', { activeZoneMinutes: { sumInCardioHeartZone: '12', sumInFatBurnHeartZone: '18' } })] },
      weightDaily: { rollupDataPoints: [daily('2026-06-22', { weight: { weightGramsAvg: 72500 } })] },
      restingHeartRaw: { dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 6, day: 22 }, beatsPerMinute: '60' } }] },
      hrvRaw: { dataPoints: [{ dailyHeartRateVariability: {
        date: { year: 2026, month: 6, day: 22 },
        averageHeartRateVariabilityMilliseconds: 47,
        deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 52.4,
        entropy: 4.8,
        nonRemHeartRateBeatsPerMinute: '57',
      } }] },
      spo2Raw: { dataPoints: [{ dailyOxygenSaturation: {
        date: { year: 2026, month: 6, day: 22 },
        averagePercentage: 97.1,
        lowerBoundPercentage: 95.8,
        upperBoundPercentage: 98.5,
      } }] },
      breathingRaw: { dataPoints: [{ dailyRespiratoryRate: { date: { year: 2026, month: 6, day: 22 }, breathsPerMinute: 14.7 } }] },
      skinTemperatureRaw: { dataPoints: [{ dailySleepTemperatureDerivations: {
        date: { year: 2026, month: 6, day: 22 },
        nightlyTemperatureCelsius: 33.2,
        baselineTemperatureCelsius: 33,
        relativeNightlyStddev30dCelsius: 0.18,
      } }] },
      cardioRaw: { dataPoints: [] },
      sleepRaw: { dataPoints: [{ dataPointName: 'sleep-1', sleep: {
        interval: { civilEndTime: civil('2026-06-22'), startTime: '2026-06-21T21:00:00Z', endTime: '2026-06-22T05:00:00Z' },
        metadata: { nap: false },
        summary: {
          minutesAsleep: '420',
          minutesAwake: '35',
          minutesInSleepPeriod: '455',
          minutesToFallAsleep: '4',
          minutesAfterWakeUp: '7',
          stagesSummary: [
            { type: 'ASLEEP', minutes: '420', count: '1' },
            { type: 'AWAKE', minutes: '35', count: '3' },
            { type: 'LIGHT', minutes: '210', count: '12' },
            { type: 'LIGHT', minutes: '210', count: '12' },
            { type: 'DEEP', minutes: '90', count: '5' },
            { type: 'DEEP', minutes: '90', count: '5' },
            { type: 'REM', minutes: '120', count: '6' },
            { type: 'REM', minutes: '120', count: '6' },
          ],
        },
        stages: [
          { type: 'LIGHT', startTime: '2026-06-21T21:00:00Z', endTime: '2026-06-21T22:00:00Z' },
          { type: 'DEEP', startTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T23:00:00Z' },
        ],
      } }] },
      activitiesRaw: { dataPoints: [{ dataPointName: 'walk-1', exercise: {
        displayName: 'Walk',
        interval: { startTime: '2026-06-22T08:00:00Z', endTime: '2026-06-22T09:00:00Z' },
        activeDuration: '3600s',
        metricsSummary: {
          caloriesKcal: 322,
          distanceMillimeters: 2_011_500,
          steps: '2760',
          averagePaceSecondsPerMeter: 1.523,
          averageHeartRateBeatsPerMinute: '104',
          heartRateZoneDurations: { lightTime: '3060s', moderateTime: '420s', vigorousTime: '120s', peakTime: '0s' },
        },
      } }] },
      stepsIntradayRaw: { dataPoints: [] },
      heartIntradayRaw: { dataPoints: [] },
      ecgRaw: { dataPoints: [
        { electrocardiogram: { interval: { startTime: '2026-06-22T10:00:00Z' }, resultClassification: 'NORMAL_SINUS_RHYTHM' } },
        { electrocardiogram: { interval: { startTime: '2026-06-23T10:00:00Z' }, resultClassification: 'INCONCLUSIVE' } },
      ] },
    }, '2026-06-22')

    expect(endpoints.profile.user.displayName).toBe('Ada')
    expect(endpoints.devices[0].deviceVersion).toBe('Google Fitbit Air')
    expect(endpoints.activity.summary.steps).toBe(8450)
    expect(endpoints.activity.summary.distances[0].distance).toBe(6.5)
    expect(endpoints.activity.summary).toMatchObject({ lightlyActiveMinutes: 41, fairlyActiveMinutes: 12, veryActiveMinutes: 22 })
    expect(endpoints.activity.summary.activeZoneMinutes.totalMinutes).toBe(30)
    expect(endpoints.bodyWeight.weight[0].weight).toBe(72.5)
    expect(endpoints.sleep.sleep[0].isMainSleep).toBe(true)
    expect(endpoints.sleep.sleep[0].logId).toBe('sleep-1')
    expect(endpoints.sleep.sleep[0].levels.summary.wake.minutes).toBe(35)
    expect(endpoints.sleep.sleep[0].levels.summary.wake.count).toBe(3)
    expect(endpoints.sleep.sleep[0].levels.summary.light.minutes).toBe(210)
    expect(endpoints.sleep.sleep[0].levels.data).toEqual([
      { dateTime: '2026-06-21T21:00:00Z', endTime: '2026-06-21T22:00:00Z', level: 'light', seconds: 3600 },
      { dateTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T23:00:00Z', level: 'deep', seconds: 3600 },
    ])
    expect(endpoints.sleep.sleep[0]).toMatchObject({ minutesToFallAsleep: 4, minutesAfterWakeUp: 7, timeInBed: 455, minutesAwake: 35 })
    expect(endpoints.hrv.hrv[0].value).toEqual({ dailyRmssd: 47, deepRmssd: 52.4, entropy: 4.8, nonRemHeartRate: 57 })
    expect(endpoints.spo2.value).toEqual({ avg: 97.1, min: 95.8, max: 98.5 })
    expect(endpoints.skinTemperature.tempSkin[0].value).toEqual({
      nightlyRelative: 0.2,
      nightlyTemperatureCelsius: 33.2,
      baselineTemperatureCelsius: 33,
      relativeNightlyStddev30dCelsius: 0.18,
    })
    expect(endpoints.activities.activities[0]).toMatchObject({
      calories: 322,
      steps: 2760,
      averagePaceSecondsPerMeter: 1.523,
      heartZoneMinutes: { light: 51, moderate: 7, vigorous: 2, peak: 0 },
    })
    expect(endpoints.ecg.ecgReadings).toHaveLength(1)
    expect(endpoints.metricTrends.values[0]).toMatchObject({
      dateTime: '2026-06-22',
      activeMinutes: 34,
      zoneMinutes: 30,
      hrvMs: 47,
      breathingRate: 14.7,
      spo2: 97.1,
      skinTemperature: 0.2,
    })
  })

  it('keeps missing rollups distinct from genuine zero values', () => {
    const endpoints = __test.translateGoogleHealth({
      stepsDaily: { rollupDataPoints: [
        daily('2026-06-21', { steps: {} }),
        daily('2026-06-22', { steps: { countSum: '0' } }),
      ] },
      activeMinutesDaily: { rollupDataPoints: [daily('2026-06-22', {})] },
    }, '2026-06-22')

    expect(endpoints.stepsTrend['activities-steps'][0].value).toBeNull()
    expect(endpoints.activity.summary.steps).toBe(0)
    expect(endpoints.activity.summary.fairlyActiveMinutes).toBeNull()
    expect(endpoints.activity.summary.veryActiveMinutes).toBeNull()
  })
})


describe('sedentary interval translation', () => {
  it('preserves provider timestamps and does not fabricate intervals from daily totals', () => {
    const interval = { startTime: '2026-06-22T08:15:00Z', endTime: '2026-06-22T09:30:00Z' }
    const result = __test.translateGoogleHealth({ sedentaryIntervalsRaw: { dataPoints: [
      { sedentaryPeriod: { interval } }, { sedentaryPeriod: { interval: { startTime: interval.startTime } } },
    ] } }, '2026-06-22')
    expect(result.sedentaryIntervals.intervals).toEqual([interval])
    expect(__test.translateGoogleHealth({}, '2026-06-22').sedentaryIntervals.intervals).toEqual([])
  })
})

describe('Air workout detail translation',()=>{
  it('retains optional lap, event, swim, timing and sample fields with correct units',()=>{
    const endpoints=__test.translateGoogleHealth({
      activitiesRaw:{dataPoints:[{name:'session-1',dataSource:{device:{displayName:'Google Fitbit Air'}},exercise:{
        exerciseType:'SWIMMING_POOL',displayName:'Pool swim',interval:{startTime:'2026-06-22T23:30:00Z',endTime:'2026-06-23T00:10:00Z',startUtcOffset:'19800s'},activeDuration:'2100s',notes:'Easy effort.',
        exerciseMetadata:{poolLengthMillimeters:'25000',hasGps:false},
        metricsSummary:{distanceMillimeters:1000000,averageSpeedMillimetersPerSecond:1250,elevationGainMillimeters:0,totalSwimLengths:40,runVo2Max:45,heartRateZoneDurations:{moderateTime:'600s'}},
        splits:[{startTime:'2026-06-22T23:30:00Z',endTime:'2026-06-22T23:40:00Z',activeDuration:'540s',splitType:'DISTANCE',metricsSummary:{distanceMillimeters:250000,averagePaceSecondsPerMeter:2.16,averageHeartRateBeatsPerMinute:'120'}}],
        exerciseEvents:[{eventTime:'2026-06-22T23:40:00Z',exerciseEventType:'PAUSE'}],
      }}]},
      heartIntradayRaw:{dataPoints:[{heartRate:{sampleTime:{physicalTime:'2026-06-22T23:30:00Z'},beatsPerMinute:123}}]},
    },'2026-06-23')
    expect(endpoints.activities.activities[0]).toMatchObject({
      exerciseType:'SWIMMING_POOL',localStartTime:'2026-06-23T05:00:00',activeDurationMinutes:35,elapsedDurationMinutes:40,
      averageSpeedKmh:4.5,elevationGainMeters:0,swimLengths:40,poolLengthMeters:25,hasGps:false,sourceDevice:'Google Fitbit Air',
      splits:[{activeMinutes:9,elapsedMinutes:10,distanceKm:.25,paceSecondsPerMeter:2.16,averageHeartRate:120}],
      events:[{type:'PAUSE',time:'2026-06-22T23:40:00Z'}],heartZoneMinutes:{light:null,moderate:10,vigorous:null,peak:null},
    })
    expect(endpoints.heartIntraday['activities-heart-intraday'].dataset[0].timestamp).toBe('2026-06-22T23:30:00Z')
    expect(endpoints.activities.coverage).toEqual({startDate:'2026-05-27',endDate:'2026-06-23'})
  })
  it('preserves zero duration, missing optional fields and does not double count both lap arrays',()=>{
    const result=__test.translateGoogleHealth({activitiesRaw:{dataPoints:[{name:'zero',exercise:{activeDuration:'0s',interval:{startTime:'2026-06-22T09:00:00Z',endTime:'2026-06-22T10:00:00Z'},splits:[{metricsSummary:{caloriesKcal:10}}],splitSummaries:[{metricsSummary:{caloriesKcal:20}}]}},{name:'missing',exercise:{displayName:'Workout'}}]}},'2026-06-22')
    expect(result.activities.activities[0].duration).toBe(0)
    expect(result.activities.activities[0].splits).toHaveLength(1)
    expect(result.activities.activities[0].splits[0].calories).toBe(20)
    expect(result.activities.activities[1]).toMatchObject({activeDurationMinutes:null,elapsedDurationMinutes:null,calories:null,runVo2Max:null,heartZoneMinutes:null,splits:[],events:[]})
    expect(__test.translateGoogleHealth({},'2026-06-22').activities.coverage).toBeNull()
  })
})
