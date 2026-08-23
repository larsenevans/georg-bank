import { test, expect } from '@playwright/test';
import { login } from './helpers/app';

const IPHONE_DEVICES = [
  // iPhone 16 Séria
  { name: 'iPhone 16 (Base)', width: 393, height: 852 },
  { name: 'iPhone 16 Plus', width: 430, height: 932 },
  { name: 'iPhone 16 Pro', width: 402, height: 874 },
  { name: 'iPhone 16 Pro Max', width: 440, height: 956 },

  // iPhone 17 Séria (Next-Gen viewports & Slim/Air)
  { name: 'iPhone 17 (Base)', width: 402, height: 874 },
  { name: 'iPhone 17 Air / Slim', width: 412, height: 892 },
  { name: 'iPhone 17 Pro', width: 402, height: 874 },
  { name: 'iPhone 17 Pro Max', width: 440, height: 956 },
];

test.describe('iPhone 16 & iPhone 17 — All Screen Viewports Verification', () => {
  for (const device of IPHONE_DEVICES) {
    test(`Screen Matrix: ${device.name} (${device.width}x${device.height})`, async ({ page }) => {
      await page.setViewportSize({ width: device.width, height: device.height });
      await login(page);

      // PIN zadanie ak sa objaví
      const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
      if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
        for (const digit of '666666') {
          await page.getByRole('button', { name: digit, exact: true }).click();
        }
        await page.waitForTimeout(500);
      }

      await expect(page.getByRole('heading', { name: 'Vaše produkty' })).toBeVisible({ timeout: 10000 });

      // 1. Overenie horizontálneho pretekania (ŽIADNY HORIZONTÁLNY SCROLL)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // 2. Overenie oranžového avatara na karte
      const profileAvatar = page.locator('img[src="/images/profile-avatar.png"]').first();
      await expect(profileAvatar).toBeVisible({ timeout: 10000 });

      // 3. Overenie 4 akčných kariet/ikon
      await expect(page.getByRole('heading', { name: 'SPACE účet' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Moneyback' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Poistenie osobných vecí a karty' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Investície' })).toBeVisible();

      // 4. Overenie modalu profilu otvorením cez button Profil
      const profileBtn = page.getByRole('button', { name: 'Profil' });
      await profileBtn.click();

      const modalAvatar = page.locator('#modal-content img[src="/images/profile-avatar.png"]');
      await expect(modalAvatar).toBeVisible({ timeout: 5000 });

      // Zavretie modalu
      const closeBtn = page.getByRole('button', { name: 'Zavrieť modal' });
      await closeBtn.click();
      await expect(modalAvatar).not.toBeVisible();

      // 5. Overenie QR Permission Flowu na mobile
      const novaPlatbaBtn = page.getByRole('button', { name: 'Nová platba' }).first();
      await novaPlatbaBtn.click();

      const skenovatQrBtn = page.getByRole('button', { name: 'Skenovať QR kód' });
      await expect(skenovatQrBtn).toBeVisible();
      await skenovatQrBtn.click();

      // Overenie permission sheetu
      const choiceHeading = page.getByText(/Ako chcete načítať platobný QR kód\?/i);
      await expect(choiceHeading).toBeVisible({ timeout: 5000 });

      const scanCameraBtn = page.getByRole('button', { name: /Skenovať kamerou/i });
      await expect(scanCameraBtn).toBeVisible();

      const photoPickerBtn = page.getByRole('button', { name: /Vybrať z Fotiek/i }).first();
      await expect(photoPickerBtn).toBeVisible();

      // Zavretie QR skenera a payment sheetu
      const closeScannerBtn = page.getByRole('button', { name: 'Zavrieť skener' });
      await closeScannerBtn.click();
      await expect(choiceHeading).not.toBeVisible();

      const closePaymentSheetBtn = page.getByRole('button', { name: 'Zavrieť novú platbu' });
      await closePaymentSheetBtn.click();
    });
  }
});
