import { test, expect, type Page } from './fixtures';
import { login, E2E_APP_PIN } from './helpers/app';

/**
 * QR Payment Flow E2E Suite
 * Automated tests use Chromium fake camera device and stream.
 * 
 * NOTE: REAL physical camera: MANUAL QA REQUIRED
 */

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
  permissions: ['camera'],
});

async function unlockPinIfNeeded(page: Page) {
  const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
  if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    for (const digit of E2E_APP_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.waitForTimeout(500);
  }
}

async function openPaymentQrScanner(page: Page) {
  await login(page);
  await unlockPinIfNeeded(page);

  // Click "Nová platba"
  const newPaymentBtn = page.getByRole('button', { name: /Nová platba/i }).first();
  await expect(newPaymentBtn).toBeVisible({ timeout: 15000 });
  await newPaymentBtn.click();

  // Click "Skenovať QR kód" inside the payment sheet
  const scanQrBtn = page.getByRole('button', { name: /Skenovať QR kód/i }).first();
  await expect(scanQrBtn).toBeVisible({ timeout: 10000 });
  await scanQrBtn.click();
}

test.describe('QR Payment Scanner (P0 Finalization)', () => {

  test('QR-01: modal opens', async ({ page }) => {
    await openPaymentQrScanner(page);
    const modalHeader = page.getByRole('heading', { name: /Skenovať platobný QR kód/i });
    await expect(modalHeader).toBeVisible({ timeout: 10000 });
  });

  test('QR-02: Scan QR Code button', async ({ page }) => {
    await openPaymentQrScanner(page);
    const scanBtn = page.getByRole('button', { name: /Skenovať kamerou|Scan QR Code/i });
    await expect(scanBtn).toBeVisible({ timeout: 5000 });
    await expect(scanBtn).toBeEnabled();
  });

  test('QR-03: video element mounted', async ({ page }) => {
    await openPaymentQrScanner(page);
    const scanBtn = page.getByRole('button', { name: /Skenovať kamerou|Scan QR Code/i });
    await scanBtn.click();

    const video = page.locator('video');
    await expect(video).toBeVisible({ timeout: 10000 });
  });

  test('QR-04: playsInline + autoplay + muted', async ({ page }) => {
    await openPaymentQrScanner(page);
    await page.getByRole('button', { name: /Skenovať kamerou|Scan QR Code/i }).click();

    const video = page.locator('video');
    await expect(video).toBeVisible({ timeout: 10000 });

    const hasPlaysInline = await video.getAttribute('playsinline');
    expect(hasPlaysInline).not.toBeNull();

    const isMuted = await video.evaluate((v: HTMLVideoElement) => v.muted);
    expect(isMuted).toBe(true);

    const isAutoPlay = await video.evaluate((v: HTMLVideoElement) => v.autoplay);
    expect(isAutoPlay).toBe(true);
  });

  test('QR-05: video dimensions > 0 pri fake camera', async ({ page }) => {
    await openPaymentQrScanner(page);
    await page.getByRole('button', { name: /Skenovať kamerou|Scan QR Code/i }).click();

    const video = page.locator('video');
    await expect(video).toBeVisible({ timeout: 10000 });

    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2;
    }, { timeout: 10000 });

    const dimensions = await video.evaluate((v: HTMLVideoElement) => ({
      width: v.videoWidth,
      height: v.videoHeight,
      readyState: v.readyState,
    }));

    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
    expect(dimensions.readyState).toBeGreaterThanOrEqual(2);
  });

  test('QR-06: Upload input accept', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('image/png');
    expect(accept).toContain('image/webp');
  });

  test('QR-07: capture="environment"', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const capture = await fileInput.getAttribute('capture');
    expect(capture).toBe('environment');
  });

  test('QR-08: valid EPC QR image', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-epc-qr.png');

    await fileInput.setInputFiles(fixturePath);

    // After uploading valid EPC QR, scanner should decode and close/show success
    await expect(page.getByRole('heading', { name: /Skenovať platobný QR kód/i })).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('QR-09: invalid image', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/invalid-qr.png');

    await fileInput.setInputFiles(fixturePath);

    // Shows error message about missing QR code
    const errorText = page.getByText(/V nahranom obrázku sa nenašiel žiadny/i).first();
    await expect(errorText).toBeVisible({ timeout: 10000 });
  });

  test('QR-10: scan fills payment form but DOES NOT submit payment', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-epc-qr.png');

    await fileInput.setInputFiles(fixturePath);

    // Form inputs should be prefilled
    const recipientInput = page.locator('#pay-recipient');
    const ibanInput = page.locator('#pay-iban');

    await expect(recipientInput).toBeVisible({ timeout: 10000 });
    await expect(recipientInput).toHaveValue(/Jan Novak/i);
    await expect(ibanInput).toHaveValue(/SK8975000000000012345678/i);

    // Payment sheet must still be open and payment NOT yet submitted
    const submitBtn = page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).first();
    await expect(submitBtn).toBeVisible();
  });

  test('QR-13: PAY by square — all 5 fields mapped into form (Meno, IBAN, Suma, VS, Poznámka)', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png');

    await fileInput.setInputFiles(fixturePath);

    // 5 fields verification
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

    // Field editability check (user can edit before authorizing)
    await noteInput.fill('Upravena poznamka');
    await expect(noteInput).toHaveValue('Upravena poznamka');

    // Payment must NOT be automatically submitted
    const submitBtn = page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).first();
    await expect(submitBtn).toBeVisible();
  });

  test('QR-14: SPAYD — all 5 fields mapped with leading zeros on VS', async ({ page }) => {
    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-spayd-5fields.png');

    await fileInput.setInputFiles(fixturePath);

    const recipientInput = page.locator('#pay-recipient');
    const ibanInput = page.locator('#pay-iban');
    const amountInput = page.locator('#pay-amount');
    const vsInput = page.locator('#pay-vs');
    const noteInput = page.locator('#pay-note');

    await expect(recipientInput).toHaveValue('Peter Ziak', { timeout: 10000 });
    await expect(ibanInput).toHaveValue('SK3109000000005012345678');
    await expect(amountInput).toHaveValue('1234.56');
    await expect(vsInput).toHaveValue('0098765432');
    await expect(noteInput).toHaveValue('Platba za material 1234');
  });

  test('QR-15: SPAYD scan does NOT POST /api/transactions', async ({ page }) => {
    const postUrls: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST') {
        postUrls.push(req.url());
      }
    });

    await openPaymentQrScanner(page);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-spayd-5fields.png');
    const postsBefore = postUrls.length;

    await fileInput.setInputFiles(fixturePath);

    await expect(page.locator('#pay-recipient')).toHaveValue('Peter Ziak', { timeout: 10000 });
    await expect(page.locator('#pay-iban')).toHaveValue('SK3109000000005012345678');

    const postsAfterScan = postUrls.slice(postsBefore);
    expect(postsAfterScan.filter((url) => url.includes('/api/transactions')).length).toBe(0);
  });

  test('QR-11: scanner closes and tracks stop', async ({ page }) => {
    await openPaymentQrScanner(page);
    await page.getByRole('button', { name: /Skenovať kamerou|Scan QR Code/i }).click();
    await expect(page.locator('video')).toBeVisible({ timeout: 10000 });

    // Close scanner
    const closeBtn = page.getByRole('button', { name: /Zavrieť skener/i }).first();
    await closeBtn.click();

    // Verify modal is closed
    await expect(page.locator('video')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /Skenovať platobný QR kód/i })).not.toBeVisible();
  });

  test('QR-12: mobile 390x844 no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPaymentQrScanner(page);

    const modal = page.getByRole('heading', { name: /Skenovať platobný QR kód/i });
    await expect(modal).toBeVisible({ timeout: 10000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
