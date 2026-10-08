# 👑 SUPERADMIN 30-DŇOVÁ RETENCIA TRANSAKCIÍ & PDF + ZÁMOK CONTRACT-1+1

## ⚠️ KRITICKÉ PRAVIDLO: ZÁMOK KONTRAKTU PRE BEŽNÝCH HOSTÍ (CONTRACT-1+1)
Pred implementáciou si uvedom, že v aplikácii existuje **zamknutý kontrakt pre bežné hosťovské prihlásenia (CONTRACT-1+1)**, ktorý sa **NESMIE** zmeniť ani narušiť:
1. **Bežný hosť (Guest)**:
   - Má povolenú presne **1 platbu**.
   - 2. platba je striktne zablokovaná kódom `403 Forbidden` (`transaction_already_used`).
   - Vygenerovanie PDF výpisu/potvrdenia **definitívne ukončí reláciu** a používateľa odhlási.
   - Všetky dáta bežného hosťa (session, request, transakcie a PDF v GCS) sa automaticky **mažú po 6 hodinách** v cron jobe.
   - Akékoľvek poškodenie testu `access-flow.regression.test.ts` je neprípustné!

2. **Superadmin (Kód `1111111199999999` / Token `superadmin_...`)**:
   - Má **God-Mode**: nekonečne veľa platieb, nekonečne veľa PDF generovaní, permanentnú session bez odhlásenia.
   - Všetky jeho odoslané transakcie a vygenerované PDF potvrdenia sa **UCHOVÁVAJÚ 30 DNÍ** a až potom sa bezpečne premazávajú.

---

## 🎯 ARCHITEKTÚRA A TECHNICKÁ ŠPECIFIKÁCIA

### 1. Rozlíšenie Superadmin transakcií v Databáze (`lib/db/schema.ts` & `app/api/transactions/route.ts`)
- Pri vytváraní záznamu v tabuľke `transaction`:
  - Ak transakciu vytvára Superadmin (`isSuperadminToken(token)`), záznam získa príznak `isSuperadmin: true` (alebo `sessionToken: superadmin_...`).
  - Ak transakciu vytvára bežný hosť, `isSuperadmin: false` (zostáva pôvodná logika).

### 2. Metadáta a ukladanie PDF v Google Cloud Storage (`app/api/receipts/upload/route.ts`)
- Pri uploade vygenerovaného PDF do bucketu `gggggg-receipts`:
  - Pre Superadmina: pridať do GCS objektu metadáta:
    ```typescript
    metadata: {
      isSuperadmin: 'true',
      retentionDays: '30',
      createdAt: new Date().toISOString()
    }
    ```
  - Pre bežného hosťa: štandardné metadáta s krátkou 6-hodinovou životnosťou.

### 3. Dvojúrovňový čistiaci Cron Job (`app/api/cron/cleanup/route.ts`)
Cron job premazáva databázu a Cloud Storage v dvoch oddelených vrstvách:

```typescript
// 1. Časové okná
const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)        // Pre bežných hostí
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Pre Superadmina

// 2. Mazanie bežných hosťovských transakcií (po 6 hodinách)
await db
  .delete(transaction)
  .where(
    and(
      eq(transaction.isSuperadmin, false),
      lt(transaction.createdAt, sixHoursAgo)
    )
  )

// 3. Mazanie Superadmin transakcií (až po 30 dňoch)
await db
  .delete(transaction)
  .where(
    and(
      eq(transaction.isSuperadmin, true),
      lt(transaction.createdAt, thirtyDaysAgo)
    )
  )

// 4. Mazanie relácií (access_session, access_request)
// Hosťovské sessions sa mažú po 6 hodinách, superadmin sessions sa nemažú vôbec alebo až po 100 rokoch.

// 5. Mazanie PDF v Google Cloud Storage
// - Súbory bez metadata.isSuperadmin === 'true' sa mažú, ak fileTime < sixHoursAgo.
// - Súbory s metadata.isSuperadmin === 'true' sa mažú IBA ak fileTime < thirtyDaysAgo.
```

---

## 🧪 SADA REGRESNÝCH TESTOV NA OVERENIE
1. **Bežný hosť CONTRACT-1+1**:
   - Spustiť `scripts/access-flow.regression.test.ts` $\rightarrow$ 1. platba OK, 2. platba 403, PDF = logout, vyčistenie po 6h.
2. **Superadmin 30-dňová retencia**:
   - Spustiť `scripts/superadmin.regression.test.ts` $\rightarrow$ platba stará 10 dní **zostáva v DB**, platba stará 31 dní je vyčistená.
3. **Kompletný beh**:
   ```bash
   npm run test:all
   ```
   Musí prejsť všetkých 15+ testov na 100% bez akejkoľvek regresie.
