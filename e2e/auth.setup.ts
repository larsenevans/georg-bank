import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { gotoApp } from './helpers/app'

const authFile = path.join(__dirname, '../playwright/.auth/user.json')

setup('authenticate', async ({ page }) => {
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Current app flow: site gate (if enabled) → guest auto-login → dashboard2
  await gotoApp(page, '/dashboard2')
  await page.waitForURL(/dashboard2/, { timeout: 30000 })
  // dashboard2 lands on the George kľúč PIN screen first; session cookie is already set
  await expect(
    page.getByText(/Zadajte bezpečnostný PIN|Prehľad|Business účet|SPACE účet/i).first()
  ).toBeVisible({ timeout: 20000 })

  await page.context().storageState({ path: authFile })
  console.log(`✅ Auth session saved to ${authFile}`)
})
