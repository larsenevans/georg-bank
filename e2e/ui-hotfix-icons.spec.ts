import { test, expect } from './fixtures';
import { login, E2E_APP_PIN } from './helpers/app';

test.describe('Dashboard2 Action Icons UI Hotfix', () => {
  const viewports = [
    { name: 'iPhone 14 (390x844)', width: 390, height: 844 },
    { name: 'iPhone 15 Pro Max (430x932)', width: 430, height: 932 },
    { name: 'Tablet (768x1024)', width: 768, height: 1024 },
    { name: 'Desktop (1280x800)', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    test(`Verify 4 action icons on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);

      const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
      if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
        for (const digit of E2E_APP_PIN) {
          await page.getByRole('button', { name: digit, exact: true }).click();
        }
        await page.waitForTimeout(500);
      }

      await expect(page.getByRole('heading', { name: 'Vaše produkty' })).toBeVisible({ timeout: 10000 });

      // Check no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Verify presence of all cards via distinct headings
      await expect(page.getByRole('heading', { name: 'Business účet' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Moneyback' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Poistenie osobných vecí a karty' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Investície' })).toBeVisible();
    });
  }
});
