// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineChart } from './Charts'

describe('heart rate axes', () => {
  it.each([[62, 63], [55, 180], [70, 70]])('uses exact, evenly spaced BPM ticks for %j', (...values) => {
    const html = renderToStaticMarkup(
      <LineChart values={values} minYTickStep={5} formatter={value => `${Math.round(value)} bpm`} />,
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    const ticks = [...document.querySelectorAll('.chart-tick')]
    const numbers = ticks.map(tick => Number(tick.textContent?.replace(' bpm', '')))
    expect(numbers.length).toBeGreaterThanOrEqual(2)
    const step = numbers[1] - numbers[0]
    numbers.forEach((value, index) => {
      expect(value % 5).toBe(0)
      if (index) expect(value - numbers[index - 1]).toBe(step)
    })
    expect(numbers[0]).toBeLessThanOrEqual(Math.min(...values))
    expect(numbers.at(-1)).toBeGreaterThanOrEqual(Math.max(...values))
    const bottomY = Number(ticks[0].getAttribute('y')) - 3
    const topY = Number(ticks.at(-1)!.getAttribute('y')) - 3
    document.querySelectorAll('circle').forEach((point, index) => {
      const expectedY = bottomY - (values[index] - numbers[0]) / (numbers.at(-1)! - numbers[0]) * (bottomY - topY)
      expect(Number(point.getAttribute('cy'))).toBeCloseTo(expectedY)
    })
  })

  it('keeps the leading digits of three-digit BPM labels inside the chart', () => {
    const html = renderToStaticMarkup(
      <LineChart values={[60, 180]} minYTickStep={5} formatter={value => `${Math.round(value)} bpm`} />,
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    document.querySelectorAll('.chart-tick').forEach(tick => {
      const leftEdge = Number(tick.getAttribute('x')) - tick.textContent!.length * 8
      expect(leftEdge).toBeGreaterThanOrEqual(0)
    })
  })
})
