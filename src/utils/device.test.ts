import { describe, expect, it } from 'vitest'
import { parseUserAgent } from './device'

describe('parseUserAgent', () => {
  it('reads the UA types that will actually sign in', () => {
    const win = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    )
    expect(win.browser).toBe('Chrome 126')
    expect(win.os).toBe('Windows')
    expect(win.device).toBe('Desktop')

    const edge = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2140',
    )
    expect(edge.browser).toBe('Microsoft Edge 120')

    const android = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    )
    expect(android.os).toBe('Android')
    expect(android.device).toBe('Mobile')

    const iphone = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    )
    expect(iphone.os).toBe('iOS')
    expect(iphone.browser).toBe('Safari 17')

    const mac = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    )
    expect(mac.os).toBe('macOS')

    const firefox = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    )
    expect(firefox.browser).toBe('Firefox 127')
  })

  it('never invents a device for an unknown agent', () => {
    const unknown = parseUserAgent('weird-scanner-bot/1.0')
    expect(unknown.browser).toBe('Unknown browser')
    expect(unknown.os).toBe('Unknown OS')
    expect(unknown.device).toBe('Desktop')
  })
})
