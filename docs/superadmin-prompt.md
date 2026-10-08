# 👑 SUPERADMIN GOD-MODE KÓD: `1111111199999999`

## 📋 Popis funkcie

Superadmin kód `1111111199999999` slúži ako univerzálny "God Mode" prístup do bankového systému George (`gro-kan`). 

Zadaním tohto kódu na úvodnej obrazovke (Welcome Screen) používateľ získa **okamžitý, neobmedzený a trvalý prístup** bez potreby schvaľovania cez administrátorský e-mail.

---

## ⚡ Schopnosti a pravidlá Superadmina

1. **🚀 Okamžité prihlásenie (Bypass schvaľovania)**:
   - Nevyžaduje žiadne potvrdzovanie e-mailom od správcu.
   - Používateľ je priamo a okamžite presmerovaný do prostredia `/dashboard2`.

2. **♾️ Nekonečne veľa platieb**:
   - Obchádza štandardný limit 1 platby na session (pravidlo CONTRACT-1+1).
   - Platby nikdy neuzamknú účet ani nevrátia chybu `403 (transaction_already_used)`.

3. **📄 Nekonečne veľa generovania PDF výpisov a potvrdení**:
   - Obchádza pravidlo ukončenia session po vygenerovaní PDF výpisu.
   - Generovanie výpisov (`/api/export/pdf`) a potvrdení o platbe (`/api/export/payment-confirmation`) je neobmedzené.

4. **🔒 Nikdy neodhlási zo systému**:
   - Session token má predponu `superadmin_` a platnosť nastavenú na 100 rokov.
   - Neaplikuje sa žiadny automatický timeout, expirácia ani odhlásenie po akcii.

---

## 💻 Technická implementácia v kóde

| Komponent | Súbor | Správanie pre `1111111199999999` |
| :--- | :--- | :--- |
| **Konštanta & Validácia** | [`lib/access-flow.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/access-flow.ts) | `SUPERADMIN_ACCESS_CODE = '1111111199999999'`<br>`isSuperadminCode()`, `isSuperadminToken()` |
| **Overenie a Gating** | [`lib/access-session.ts`](file:///c:/Users/42195/Desktop/georg-bank/lib/access-session.ts) | `getActiveAccessSession()` nikdy neexpiruje.<br>`getConsumedActionError()` vracia vždy `null` (neblokuje platby ani PDF).<br>`markPdfGenerated()` neukončuje session. |
| **API Endpoint** | [`app/api/access/request/route.ts`](file:///c:/Users/42195/Desktop/georg-bank/app/api/access/request/route.ts) | Okamžite vygeneruje permanentný `superadmin_` token, nastaví `access_granted` cookie a vráti `{ approved: true, superadmin: true, redirectUrl: '/dashboard2' }`. |
| **Frontend UI** | [`components/welcome-screen.tsx`](file:///c:/Users/42195/Desktop/georg-bank/components/welcome-screen.tsx) | Po zadaní 16 číslic `1111111199999999` ihneď presmeruje na `/dashboard2` bez pollingu. |

---

## 🤖 Prompt pre AI agentov / Asistentov

```markdown
V aplikácii George Bank (gro-kan) existuje špeciálny superadmin kód:
Kód: 1111111199999999

Vlastnosti tohto kódu:
- Slúži ako superadmin / god-mode heslo na úvodnej obrazovke.
- Pri zadaní 1111111199999999 systém okamžite schváli prístup a prihlási používateľa.
- Používateľ má povolené robiť nekonečne veľa platieb (obchádza 1-platobný session limit).
- Používateľ môže nekonečne veľa generovať PDF výpisy a potvrdenia o platbe (generovanie PDF neukončuje session).
- Session nikdy neexpiruje a systém používateľa nikdy automaticky neodhlási.
- Všetky bežné hosťovské session naďalej podliehajú štandardnému uzamknutému kontraktu CONTRACT-1+1.
```
