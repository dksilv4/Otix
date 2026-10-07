// Throwaway browser verification of the per-plugin API token flow:
// no standalone token list on the Plugins page; an enabled plugin's Permissions
// tab shows API access Active and "Rotate token" reveals a one-time secret.
//   node e2e-token-ui.mjs
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:5173'
const results = []
const pass = (m) => { results.push('PASS ' + m); console.log('PASS', m) }
const fail = (m) => { results.push('FAIL ' + m); console.log('FAIL', m) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 400)) })

try {
  await page.goto(base + '/auth/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.fill('#identity', 'tokenui_tester')
  await page.fill('#login-password', 'Testpass123!')
  await page.click('#login-submit')
  await page.waitForFunction(() => !!localStorage.getItem('otix-access-token'), { timeout: 20000 })
  pass('login set access token')

  // 1. Plugins page no longer shows the standalone token list.
  await page.goto(base + '/settings/plugins', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByTitle('Configure').first().waitFor({ state: 'visible', timeout: 20000 })
  const listHeader = await page.getByText('API access tokens', { exact: true }).count()
  if (listHeader === 0) pass('no standalone API access tokens panel on the Plugins page')
  else fail('standalone token list still rendered')

  // 2. Open the enabled plex plugin's Permissions tab.
  await page.getByTitle('Configure').first().click()
  await page.locator('h2', { hasText: 'plex' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('button', { name: 'Permissions', exact: true }).click()

  // 3. Enabled plugin => API access active with a Rotate action (no Grant CTA).
  const grantCta = await page.getByRole('button', { name: 'Grant API access' }).count()
  if (grantCta === 0) pass('no Grant API access CTA for an enabled plugin')
  else fail('stale Grant API access CTA shown')
  const rotateBtn = page.getByRole('button', { name: 'Rotate token' })
  await rotateBtn.waitFor({ state: 'visible', timeout: 20000 })
  pass('enabled plugin shows Rotate token in Permissions')

  // 4. Rotate mints and reveals the one-time secret.
  await rotateBtn.click()
  const secret = page.locator('input[readonly]').first()
  await secret.waitFor({ state: 'visible', timeout: 15000 })
  const secretVal = await secret.inputValue()
  if (secretVal.startsWith('otxp_') && secretVal.length > 20) {
    pass('rotate revealed one-time secret (otxp_…)')
  } else {
    fail('secret value unexpected: ' + secretVal.slice(0, 12))
  }

  // 5. Done collapses the reveal; Rotate token is back for the next rotation.
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Rotate token' }).waitFor({ state: 'visible', timeout: 15000 })
  pass('Done returns to the Rotate token state')

  await page.screenshot({ path: '/tmp/otix-token-ui.png', fullPage: false })
  pass('screenshot saved to /tmp/otix-token-ui.png')
} catch (err) {
  fail('EXCEPTION: ' + (err && err.message ? err.message : String(err)))
  await page.screenshot({ path: '/tmp/otix-token-ui-error.png' }).catch(() => {})
} finally {
  await browser.close()
}

console.log('\n---- ' + results.filter((r) => r.startsWith('PASS')).length + ' passed, ' +
  results.filter((r) => r.startsWith('FAIL')).length + ' failed ----')
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
