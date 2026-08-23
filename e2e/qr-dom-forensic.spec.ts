import { test, expect } from '@playwright/test';
import path from 'path';
import { login } from './helpers/app';

test.describe('Forensic DOM Verification', () => {
  test('Capture direct DOM inputs and network POST requests after scan', async ({ page }) => {
    // Track all POST network requests
    const postRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST') {
        postRequests.push(req.url());
      }
    });

    await login(page);

    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
    if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      for (const digit of '666666') {
        await page.getByRole('button', { name: digit, exact: true }).click();
      }
      await page.waitForTimeout(500);
    }

    // Open New Payment
    await page.getByRole('button', { name: /Nová platba/i }).first().click();
    await page.waitForTimeout(300);

    // Open QR Scanner
    await page.getByRole('button', { name: /Skenovať QR kód/i }).first().click();
    await page.waitForTimeout(300);

    // Clear recorded POST requests before scan to isolate scan actions
    const postsBeforeScan = postRequests.length;

    // Upload PAY by square fixture
    const fileInput = page.locator('input[type="file"]');
    const pbsFixture = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png');
    await fileInput.setInputFiles(pbsFixture);

    // Wait 2 full seconds as required by instruction
    await page.waitForTimeout(2000);

    // Check POST requests triggered during scan and wait
    const postsAfterScan = postRequests.slice(postsBeforeScan);
    console.log('FORENSIC_POST_REQUESTS_AFTER_SCAN:', JSON.stringify(postsAfterScan));

    // Read ACTUAL DOM input values
    const domValues = {
      recipient: await page.locator('#pay-recipient').inputValue(),
      iban: await page.locator('#pay-iban').inputValue(),
      amount: await page.locator('#pay-amount').inputValue(),
      vs: await page.locator('#pay-vs').inputValue(),
      note: await page.locator('#pay-note').inputValue(),
    };

    console.log('FORENSIC_ACTUAL_DOM_VALUES:', JSON.stringify(domValues));

    expect(domValues.recipient).toBe('Miroslav Polacek');
    expect(domValues.iban).toBe('SK3109000000005012345678');
    expect(domValues.amount).toBe('125.50');
    expect(domValues.vs).toBe('0000123456');
    expect(domValues.note).toBe('Uhrada faktury 2026');

    // Also test SPAYD with leading zeros
    await page.getByRole('button', { name: /Skenovať QR kód/i }).first().click();
    await page.waitForTimeout(300);
    const spaydFixture = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-spayd-5fields.png');
    await fileInput.setInputFiles(spaydFixture);
    await page.waitForTimeout(2000);

    const spaydDomValues = {
      recipient: await page.locator('#pay-recipient').inputValue(),
      iban: await page.locator('#pay-iban').inputValue(),
      amount: await page.locator('#pay-amount').inputValue(),
      vs: await page.locator('#pay-vs').inputValue(),
      note: await page.locator('#pay-note').inputValue(),
    };

    console.log('FORENSIC_SPAYD_DOM_VALUES:', JSON.stringify(spaydDomValues));
    expect(spaydDomValues.vs).toBe('0098765432');
  });
});
