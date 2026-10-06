import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { gotoApp } from './helpers/app'
import { grantAccessSession } from './helpers/access-session'

const authFile = path.join(__dirname, '../playwright/.auth/user.json')
// Separate approved access session for specs that end it (e.g. POST /api/access/logout),
// so they cannot invalidate the shared session stored in user.json.
const accessRegressionAuthFile = path.join(__dirname, '../playwright/.auth/access-regression.json')

setup('authenticate', async ({ page, baseURL }) => {
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Access flow gate: without an approved access session /dashboard2 bounces
  // /welcome <-> /api/access/logout (ERR_TOO_MANY_REDIRECTS). Approve a test
  // session through the real API flow and keep its cookie in storageState.
  await grantAccessSession(page.context(), baseURL ?? 'http://localhost:3030')

  // Current app flow: access cookie -> site gate (if enabled) -> guest auto-login -> dashboard2
  await gotoApp(page, '/dashboard2')
  await page.waitForURL(/dashboard2/, { timeout: 30000 })
  // dashboard2 lands on the George kľúč PIN screen first; session cookie is already set
  await expect(
    page.getByText(/Zadajte bezpečnostný PIN|Prehľad|Business účet|SPACE účet/i).first()
  ).toBeVisible({ timeout: 20000 })

  await page.context().storageState({ path: authFile })
  console.log(`✅ Auth session saved to ${authFile}`)

  await grantAccessSession(page.context(), baseURL ?? 'http://localhost:3030')
  await page.context().storageState({ path: accessRegressionAuthFile })
})
