import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { login } from './helpers/app';

const artifactDir =
  process.env.QR_SMOKE_ARTIFACT_DIR ??
  path.join(process.cwd(), 'test-results', 'qr-smoke-screenshots');

test.describe('QR Smoke Test & 5x Screenshot Verification', () => {
  test.beforeAll(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
  });

  test('Capture 5-step smoke test proof', async ({ page }) => {
    // 1. Prihlásenie a Dashboard2
    await login(page);
    await page.waitForTimeout(1000);

    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i);
    if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      for (const digit of '666666') {
        await page.getByRole('button', { name: digit, exact: true }).click();
      }
      await page.waitForTimeout(500);
    }

    // SCREENSHOT 1: Dashboard2 s tlačidlom "Nová platba"
    const shot1 = path.join(artifactDir, '01_dashboard2_ready.png');
    await page.screenshot({ path: shot1, fullPage: false });

    // 2. Otvorenie "Nová platba"
    const newPaymentBtn = page.getByRole('button', { name: /Nová platba/i }).first();
    await expect(newPaymentBtn).toBeVisible({ timeout: 10000 });
    await newPaymentBtn.click();
    await page.waitForTimeout(500);

    // SCREENSHOT 2: Prázdny formulár "Nová platba"
    const shot2 = path.join(artifactDir, '02_payment_form_empty.png');
    await page.screenshot({ path: shot2, fullPage: false });

    // 3. Otvorenie "Skenovať QR kód"
    const scanQrBtn = page.getByRole('button', { name: /Skenovať QR kód/i }).first();
    await expect(scanQrBtn).toBeVisible({ timeout: 10000 });
    await scanQrBtn.click();
    await page.waitForTimeout(500);

    // SCREENSHOT 3: QR Scanner modal
    const shot3 = path.join(artifactDir, '03_qr_scanner_modal.png');
    await page.screenshot({ path: shot3, fullPage: false });

    // 4. Nahratie reálneho PAY by square QR (obsahuje všetkých 5 hodnôt)
    const fileInput = page.locator('input[type="file"]');
    const pbsFixture = path.resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png');
    await fileInput.setInputFiles(pbsFixture);
    await page.waitForTimeout(1000);

    // Overenie 5 polí
    const recipientInput = page.locator('#pay-recipient');
    const ibanInput = page.locator('#pay-iban');
    const amountInput = page.locator('#pay-amount');
    const vsInput = page.locator('#pay-vs');
    const noteInput = page.locator('#pay-note');

    await expect(recipientInput).toHaveValue('Miroslav Polacek');
    await expect(ibanInput).toHaveValue('SK3109000000005012345678');
    await expect(amountInput).toHaveValue('125.50');
    await expect(vsInput).toHaveValue('0000123456');
    await expect(noteInput).toHaveValue('Uhrada faktury 2026');

    // SCREENSHOT 4: Automaticky vyplnených 5 polí z QR kódu
    const shot4 = path.join(artifactDir, '04_form_5_fields_filled_from_qr.png');
    await page.screenshot({ path: shot4, fullPage: false });

    // 5. Používateľská úprava poľa pred autorizáciou
    await noteInput.fill('Uhrada faktury 2026 — fyzicky overene');
    await page.waitForTimeout(500);

    // SCREENSHOT 5: Formulár pripravený na explicitnú autorizáciu cez George kľúč
    const shot5 = path.join(artifactDir, '05_user_edited_before_george_auth.png');
    await page.screenshot({ path: shot5, fullPage: false });

    console.log('VŠETKÝCH 5 SCREENSHOTOV BOLO ÚSPEŠNE VYGENEROVANÝCH A ULOŽENÝCH!');
  });
});
