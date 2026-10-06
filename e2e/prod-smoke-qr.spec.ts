import { test, expect } from '@playwright/test';
import path from 'path';
import { E2E_APP_PIN } from './helpers/app';

test.describe('Production Smoke Test', () => {
  test('Verify QR scan flow on live Vercel production deployment', async ({ page }) => {
    // Intercept POST requests to verify payment is not auto-submitted
    const postRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST') {
        postRequests.push(req.url());
      }
    });

    const targetUrl = 'https://georg-bank.vercel.app/dashboard2';
    await page.goto(targetUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

    // Handle gate if present
    if (page.url().includes('/gate')) {
      const qm = page.getByTestId('red-question-mark');
      if (await qm.isVisible({ timeout: 3000 }).catch(() => false)) {
        await qm.click();
      }
      const pw = page.locator('input[type="password"]');
      if (await pw.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pw.fill(process.env.SITE_GATE_PASSWORD || 'heslo');
        await pw.press('Enter');
      }
      await page.waitForURL((url) => !url.pathname.includes('/gate'), { timeout: 30000 });
    }

    // Wait for Dashboard2
    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
    if (await pinHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (const digit of E2E_APP_PIN) {
        await page.getByRole('button', { name: digit, exact: true }).click();
      }
      await page.waitForTimeout(500);
    }

    // Open Nova platba
    const newPaymentBtn = page.getByRole('button', { name: /Nová platba/i }).first();
    await expect(newPaymentBtn).toBeVisible({ timeout: 15000 });
    await newPaymentBtn.click();

    // Skenovat QR kod
    const scanQrBtn = page.getByRole('button', { name: /Skenovať QR kód/i }).first();
    await expect(scanQrBtn).toBeVisible({ timeout: 10000 });
    await scanQrBtn.click();

    const postsBeforeScan = postRequests.length;

    // Upload valid-pbs-5fields.png
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png');
    await fileInput.setInputFiles(fixturePath);

    // Wait for scan to process
    await page.waitForTimeout(2000);

    const postsAfterScan = postRequests.slice(postsBeforeScan);
    console.log('PROD_POSTS_AFTER_SCAN:', JSON.stringify(postsAfterScan));

    // Verify 5 fields
    const recipient = await page.locator('#pay-recipient').inputValue();
    const iban = await page.locator('#pay-iban').inputValue();
    const amount = await page.locator('#pay-amount').inputValue();
    const vs = await page.locator('#pay-vs').inputValue();
    const note = await page.locator('#pay-note').inputValue();

    console.log('PROD_ACTUAL_DOM:', JSON.stringify({ recipient, iban, amount, vs, note }));

    expect(recipient).toBe('Miroslav Polacek');
    expect(iban).toBe('SK3109000000005012345678');
    expect(amount).toBe('125.50');
    expect(vs).toBe('0000123456');
    expect(note).toBe('Uhrada faktury 2026');
    expect(postsAfterScan.filter(url => url.includes('/api/transactions') || url.includes('/api/webhooks/process-payment')).length).toBe(0);
  });
});
