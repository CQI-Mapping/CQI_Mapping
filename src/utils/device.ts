// Real device/browser facts for the Security & Privacy page's current-session
// card. The browser and OS come straight from the user-agent the signer-in
// presented — nothing here is invented; unknown agents fall back to "Unknown"
// rather than a guess.
//
// Deliberately small: Supabase exposes no session-list API, so the only
// honest device data the app can show is its own navigator.userAgent.

export interface DeviceInfo {
  browser: string
  os: string
  device: 'Desktop' | 'Mobile' | 'Tablet'
}

export function parseUserAgent(ua: string = navigator.userAgent): DeviceInfo {
  const browser = detectBrowser(ua)
  const os = detectOs(ua)
  const device = detectDevice(ua)
  return { browser, os, device }
}

function detectBrowser(ua: string): string {
  // Order matters: Chromium-based browsers name-check in nesting order, so
  // the most specific product string has to win first.
  const rules: Array<[RegExp, string]> = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
    [/Safari\/?/, 'Safari'],
  ]
  for (const [re, name] of rules) {
    const m = ua.match(re)
    if (m) {
      return m[1] ? `${name} ${m[1].split('.')[0]}` : name
    }
  }
  return 'Unknown browser'
}

function detectOs(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows'
  if (/Windows/.test(ua)) return 'Windows (older)'
  if (/Android/.test(ua)) return 'Android'
  if (/(iPhone|iPod)/.test(ua)) return 'iOS'
  if (/iPad/.test(ua)) return 'iPadOS'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/CrOS/.test(ua)) return 'Chrome OS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Unknown OS'
}

function detectDevice(ua: string): DeviceInfo['device'] {
  // iPads report as desktop Safari unless the "mobile" token is present,
  // so tablets are matched before the mobile fallthrough.
  if (/iPad|Tablet/.test(ua)) return 'Tablet'
  if (/Mobi|iPhone|Android.*Mobile/.test(ua)) return 'Mobile'
  return 'Desktop'
}
