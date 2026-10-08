# 👑 SUPERADMIN GOD-MODE KÓD: `1111111199999999`

## 📋 Popis funkcie

Superadmin kód `1111111199999999` slúži ako univerzálny "God Mode" prístup do bankového systému George (`gro-kan`). 

Zadaním tohto kódu na úvodnej obrazovke (Welcome Screen) používateľ získa **okamžitý, neobmedzený a trvalý prístup** bez potreby schvaľovania cez administrátorský e-mail.

---

## ⚡ Schopnosti a pravidlá Superadmina

1. **🚀 Okamžité prihlásenie (Bypass schvaľovania)**:
   - Nevyžaduje žiadne potvrdzovanie e-mailom od správcu.
   - Používateľ je priamo a okamžite presmerovaný do prostredia `/dashboard2`.
   - Podporuje formát bez medzier `1111111199999999` aj formát 4x4 `1111 1111 9999 9999`.

2. **♾️ Nekonečne veľa platieb**:
   - Obchádza štandardný limit 1 platby na session (pravidlo CONTRACT-1+1).
   - Platby nikdy neuzamknú účet ani nevrátia chybu `403 (transaction_already_used)`.

3. **📄 Nekonečne veľa generovania PDF výpisov a potvrdení**:
   - Obchádza pravidlo ukončenia session po vygenerovaní PDF výpisu.
   - Generovanie výpisov (`/api/export/pdf`) a potvrdení o platbe (`/api/export/payment-confirmation`) je neobmedzené.

4. **🔒 Nikdy neodhlási zo systému (Permanent Session)**:
   - Session token má predponu `superadmin_` a platnosť nastavenú na 100 rokov.
   - Neaplikuje sa žiadny automatický timeout, expirácia ani odhlásenie po akcii.
   - Zero-latency: `getActiveAccessSession` overuje superadmin token v pamäti bez čakania na DB.

5. **💰 Nemenný zostatok na účte (minimálne 7 589,20 €)**:
   - Pre Superadmina ostáva zostatok nemenný a nikdy sa negeneruje náhodne pri prihlásení ani pri PIN/FaceID overení.
   - Pri prihlásení alebo obnovení sa garantuje minimálny zostatok 7 589,20 € (`SUPERADMIN_FIXED_BALANCE_EUR = 7589.20`, `758920` centov).
   - Bežní hostia naďalej dostávajú náhodný zostatok v rozmedzí 4 675,45 € až 15 873,20 €.

---

## 🧪 Regresné a automatizované testy

Všetky pravidlá Superadmina sú chránené dedikovanými testami:

1. **Jednotkový regresný test**: [`scripts/superadmin.regression.test.ts`](file:///c:/Users/42195/Desktop/georg-bank/scripts/superadmin.regression.test.ts)
   - Overenie kódu, orezanie medzier, zero-latency session resolution.
   - Test 10+ po sebe idúcich platieb bez 403.
   - Test 10+ po sebe idúcich PDF bez 403 a bez ukončenia session.
   - Izolácia: overenie, že štandardní hostia stále podliehajú zámku CONTRACT-1+1.
   - Overenie nemenného zostatku: minimálne 7 589,20 € (758920 centov).

2. **Browser E2E test**: [`e2e/superadmin.spec.ts`](file:///c:/Users/42195/Desktop/georg-bank/e2e/superadmin.spec.ts)
   - Playwright test okamžitého prihlásenia a navigácie na `/dashboard2`.

3. **Spustenie kompletnej sady**:
   ```bash
   npm run test:all
   ```

---

## 💻 Technická implementácia v kóde

| Komponent | Súbor | Správanie pre `1111111199999999` |
| :--- | :--- | :--- |
| **Konštanta & Validácia** | [`lib/access-flow.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/access-flow.ts) | `SUPERADMIN_ACCESS_CODE = '1111111199999999'`<br>`isSuperadminCode()`, `isSuperadminToken()` |
| **Pevný zostatok** | [`lib/random-balance.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/random-balance.ts) | `SUPERADMIN_FIXED_BALANCE_EUR = 7589.20`<br>`SUPERADMIN_FIXED_BALANCE_CENTS = 758920` |
| **Server Zostatok** | [`lib/random-balance-server.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/random-balance-server.ts) | `applyLoginSessionBalance()` negeneruje náhodný zostatok pre Superadmina, garantuje minimálne 7 589,20 €. |
| **Overenie a Gating** | [`lib/access-session.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/access-session.ts) | `getActiveAccessSession()` vracia permanentnú aktívnu session v pamäti.<br>`getConsumedActionError()` vracia vždy `null` (neblokuje platby ani PDF).<br>`afterTransactionSuccess()` a `afterPdfSuccess()` neukončujú session. |
| **API Endpoint** | [`app/api/access/request/route.ts`](file:///c:/Users/42195/Desktop/georg-bank/app/api/access/request/route.ts) | Okamžite vygeneruje permanentný `superadmin_` token, nastaví 100-ročnú `gro_kan_session` cookie a zabezpečí účet s minimálne 7 589,20 €. |
| **Frontend UI** | [`components/welcome-screen.tsx`](file:///c:/Users/42195/Desktop/georg-bank/components/welcome-screen.tsx) | Po zadaní `1111111199999999` ihneď presmeruje na `/dashboard2` bez pollingu. |

---

## 🤖 Pripravený Prompt na použitie (Kopírovať & Vložiť)

```text
V bankovej aplikácii George (gro-kan) je implementovaný Superadmin God-Mode kód:

KÓD: 1111111199999999 (alebo 1111 1111 9999 9999)

PRAVIDLÁ A SCHOPNOSTI:
1. Okamžité prihlásenie: Po zadaní kódu na úvodnej obrazovke /welcome dôjde k okamžitému schváleniu prístupu a presmerovaniu na /dashboard2 bez čakania na admin e-mail.
2. Neobmedzené platby: Superadmin môže vykonať ľubovoľný počet platieb za sebou bez toho, aby bol blokovaný chybou 403 (transaction_already_used).
3. Neobmedzené PDF: Generovanie PDF výpisov alebo potvrdení o platbe nikdy neukončí session používateľa (žiadne 403 pdf_already_generated).
4. Trvalá session: Session nikdy neexpiruje (platnosť 100 rokov) a systém používateľa nikdy automaticky neodhlási.
5. Izolácia: Štandardné hosťovské session naďalej prísne podliehajú pravidlu CONTRACT-1+1 (1 platba + 1 PDF = koniec).
```

