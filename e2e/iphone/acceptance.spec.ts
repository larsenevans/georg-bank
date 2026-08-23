import { test, expect } from '@playwright/test';
import { login } from '../helpers/app';
import path from 'path';

test.describe('iOS WebKit Acceptance — Real Mobile Flow', () => {

  test('Complete iOS WebKit Acceptance: Safe Areas, SVG Icons Geometry, Orange Avatar, QR Scan, 5-Field Prefill, Rotate & No POST', async ({ page }) => {
    // 1. Authenticate / Login
    await login(page);

    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
    if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      for (const digit of '666666') {
        await page.getByRole('button', { name: digit, exact: true }).click();
      }
      await page.waitForTimeout(500);
    }

    await expect(page.getByRole('heading', { name: 'Vaše produkty' })).toBeVisible({ timeout: 15000 });

    // 2. Safe Area Inset & Zero Horizontal Scroll Verification
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // 3. Orange Avatar Geometry & Content Verification
    const avatarImg = page.locator('img[src="/images/profile-avatar.png"]').first();
    await expect(avatarImg).toBeVisible({ timeout: 10000 });
    const avatarBox = await avatarImg.boundingBox();
    expect(avatarBox).not.toBeNull();
    // 52px mobile or 56px desktop wrapper
    expect(avatarBox!.width).toBeGreaterThanOrEqual(48);
    expect(avatarBox!.width).toBeLessThanOrEqual(60);
    expect(avatarBox!.height).toBeGreaterThanOrEqual(48);
    expect(avatarBox!.height).toBeLessThanOrEqual(60);

    // 4. SVG Icon Geometry Verification (Moneyback, Poistenie, Investície)
    // Moneyback icon wrapper
    const moneybackCard = page.locator('.george-card').filter({ hasText: 'Moneyback' });
    await expect(moneybackCard).toBeVisible();
    const moneybackIcon = moneybackCard.locator('svg').first();
    await expect(moneybackIcon).toBeVisible();
    const mbBox = await moneybackIcon.boundingBox();
    expect(mbBox).not.toBeNull();
    expect(mbBox!.width).toBeGreaterThan(15);
    expect(mbBox!.height).toBeGreaterThan(15);

    // Poistenie icon wrapper
    const poistenieCard = page.locator('.george-card').filter({ hasText: 'Poistenie osobných vecí' });
    await expect(poistenieCard).toBeVisible();
    const poistenieIcon = poistenieCard.locator('svg').first();
    await expect(poistenieIcon).toBeVisible();
    const poiBox = await poistenieIcon.boundingBox();
    expect(poiBox).not.toBeNull();
    expect(poiBox!.width).toBeGreaterThan(15);

    // Investície icon wrapper
    const investicieCard = page.locator('.george-card').filter({ hasText: 'Investície' });
    await expect(investicieCard).toBeVisible();
    const investicieIcon = investicieCard.locator('svg').first();
    await expect(investicieIcon).toBeVisible();
    const invBox = await investicieIcon.boundingBox();
    expect(invBox).not.toBeNull();
    expect(invBox!.width).toBeGreaterThan(15);

    // 5. Profil Modal Verification
    const profileBtn = page.getByRole('button', { name: 'Profil' });
    await profileBtn.click();
    const modalAvatar = page.locator('#modal-content img[src="/images/profile-avatar.png"]');
    await expect(modalAvatar).toBeVisible({ timeout: 5000 });
    const closeProfileModalBtn = page.getByRole('button', { name: 'Zavrieť modal' });
    await closeProfileModalBtn.click();
    await expect(modalAvatar).not.toBeVisible();

    // 6. Network Intercept: Verify 0 automatic payment POST calls
    let postTransactionsCalls: Array<{ url: string; postData: string | null }> = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && (req.url().includes('/api/transactions') || req.url().includes('/api/webhooks/process-payment'))) {
        postTransactionsCalls.push({ url: req.url(), postData: req.postData() });
      }
    });

    // 7. Nová platba -> QR Scanner Permission Choice Sheet
    const novaPlatbaBtn = page.getByRole('button', { name: 'Nová platba' }).first();
    await novaPlatbaBtn.click();

    const skenovatQrBtn = page.getByRole('button', { name: 'Skenovať QR kód' });
    await expect(skenovatQrBtn).toBeVisible();
    await skenovatQrBtn.click();

    // Verify choice sheet
    const choiceHeading = page.getByText(/Ako chcete načítať platobný QR kód\?/i);
    await expect(choiceHeading).toBeVisible({ timeout: 5000 });

    // 8. Photo Picker Upload & Decoding of all 5 Fields (PAY by square)
    const fileInput = page.locator('input[type="file"]');
    const validQrPath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png');
    await fileInput.setInputFiles(validQrPath);

    // Verify form receives all 5 prefilled fields
    const recipientInput = page.locator('#pay-recipient');
    const ibanInput = page.locator('#pay-iban');
    const amountInput = page.locator('#pay-amount');
    const vsInput = page.locator('#pay-vs');
    const noteInput = page.locator('#pay-note');

    await expect(recipientInput).toHaveValue('Miroslav Polacek', { timeout: 10000 });
    await expect(ibanInput).toHaveValue('SK3109000000005012345678');
    await expect(amountInput).toHaveValue('125.50');
    await expect(vsInput).toHaveValue('0000123456');
    await expect(noteInput).toHaveValue('Uhrada faktury 2026');

    // 9. Verify NO payment POST occurred upon scan
    expect(postTransactionsCalls.length).toBe(0);

    // 10. Editable Fields: user changes amount before submitting
    await amountInput.fill('150.00');
    await expect(amountInput).toHaveValue('150.00');

    // 11. Viewport Orientation: Rotate to Landscape and verify zero overflow
    const currentSize = page.viewportSize() || { width: 393, height: 852 };
    await page.setViewportSize({ width: currentSize.height, height: currentSize.width });
    await page.waitForTimeout(300);

    const landscapeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const landscapeClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(landscapeScrollWidth).toBeLessThanOrEqual(landscapeClientWidth + 1);

    // Rotate back to portrait
    await page.setViewportSize({ width: currentSize.width, height: currentSize.height });
    await page.waitForTimeout(300);

    // Verify still zero POST calls
    expect(postTransactionsCalls.length).toBe(0);

    // 12. Close payment sheet and verify closed state
    const closePaymentSheetBtn = page.getByRole('button', { name: 'Zavrieť novú platbu' });
    await closePaymentSheetBtn.click();
    await expect(page.locator('#payment-sheet')).toHaveClass(/pointer-events-none/);
    await expect(page.locator('#payment-sheet')).toHaveAttribute('aria-hidden', 'true');
  });
});
