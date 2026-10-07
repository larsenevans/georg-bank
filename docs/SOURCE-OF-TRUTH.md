SOURCE-OF-TRUTH — georg-bank / abon
Pravidlo dokumentu: Zapisuje sa sem výhradne overený stav (príkaz bol spustený a výstup bol videný). Nič predpokladané, nič plánované. Pri každom novom fakte: dátum + dôkaz (príkaz + výstup). Ak niečo nie je v tomto dokumente, považuje sa za neoverené.

Dokument založený: 2025 (po kompletní diagnostike prostredia)
Správca: Erik (u0352652320@gmail.com — hlavný účet, žiadny iný)
Formát: každá sekcia má stav ✅ (overené) / ⚠️ (čiastočne) / ❌ (neoverené/chýba)

1. Identity & účty
   Položka Hodnota Stav
   Hlavný GCP účet u0352652320@gmail.com ✅ ACTIVE v gcloud
   Sekundárny GCP účet (nepoužívať) erikbabcan@gmail.com, larsenevans89@gmail.com ✅ existujú, ZAKÁZANÉ pre tento projekt
   GitHub repo larsenevans/georg-bank ✅
   GitHub vetva abonbranch (default, jediná povolená) ✅
   Hlavný e-mail pre notifikácie definovaný v abon-*.txt (ACCESS_ADMIN_EMAIL) ✅ v súbore
   Pravidlo: Všetok GCP work ide pod u0352652320@gmail.com. Nikdy erikbabcan ani larsenevans89.

2. GCP projekty
   Projekt ID Názov Účel Stav
   gggggg-510905 GgGgGg (proj. č. 1040062317673) NOVÝ domov georg-bank (abon) ✅ ACTIVE
   noorgrowmfinnal-58800798-76fac Firebase app STARÁ PRODUKCIA — NEDOTKNUTEĽNÁ ✅ nedotknutá, revízia georg-bank-00028-xb9
   gen-lang-client-0127015578 AURA nepoužívať pre tento projekt ✅ nedotknutý
   Billing
   Billing account: 019318-DDF309-08FA2B ("My Billing Account", OPEN=True) ✅
   gggggg-510905 → billingEnabled = True ✅ (overené gcloud billing projects describe)
   Odpojený projekt na uvoľnenie kvóty: gifted-mountain-476207-u4 (unlinked, bol prázdny) ✅
   API na gggggg-510905 (všetky zapnuté ✅)
   run, sqladmin, cloudbuild, artifactregistry, logging, secretmanager

3. Cloud SQL — gggggg-sql
   Inštancia gggggg-sql ✅ vytvorená
   Verzia POSTGRES_15 ✅
   Tier db-f1-micro ✅
   Región europe-west3 ✅
   Public IP 34.179.222.228 ✅ (overené pri create)
   SSL --ssl-mode=ENCRYPTED_ONLY (pripojenie ?sslmode=require) ✅
   Authorized networks 0.0.0.0/0 ✅
   Stav RUNNABLE ✅
   Databáza internet_bank ✅ vytvorená
   Používateľ georg_app (hex heslo) ✅ vytvorený
   Migrácie 0000–0004 aplikované ✅ aplikované
   Seed ✅ aplikovaný (5 používateľov)
   access_request.email stĺpec ✅ overený (text)
   Poznámka: pôvodne bola inštancia omylom vytvorená ako georg-bank-sql — názov zmenený na gggggg-sql (konvencia: všetko podľa projektu gggggg).

4. Zdrojový kód (overené diagnostikou)
   Položka Hodnota Stav
   Vetva abonbranch ✅
   HEAD 9aedbf9 (≥ f222f40) ✅
   Pracovný strom čistý ✅
   Remote https://github.com/larsenevans/georg-bank.git ✅
   Kľúčové súbory (13/13) access-flow, access-session, access-request-store, welcome page + screen, 5× API routes, proxy.ts, migrácie 0003+0004, Dockerfile ✅ všetky existujú
   Kľúčové kontrakty access flow (uzamknuté regresnými testami)
   Kód: presne 16 číslic ^[0-9]{16}$
   Rate limit: 5 requestov/IP/hodinu, 6. → 429 ✅ overené lokálne aj na Cloud Run
   Expirácia žiadosti: 24 h
   Auto-logout: presne 60 s po vyčerpaní (1 platba + 1 PDF)
   Session cookie: access_granted, httpOnly, 30 dní
   Decide endpoint: idempotentný, 403 pri zlom tokene
5. Lokálne prostredie (všetko ✅ overené)
   Položka Stav
   Priečinok (JEDINÝ platný) C:\Users\42195\Desktop\georg-bank
   ZAKÁZANÁ stará kópia C:\Users\42195\.gemini\antigravity-ide\scratch\georg-bank
   Dev server port 3030, /api/health → 200 database=ok ✅
   Docker Postgres kontajner georg-postgres, PostgreSQL 15.19
   Lokálna DB internet_bank, 6/6 tabuliek, access_request.email ✅, 4 seedovaní používatelia
   Welcome screen iOS keypad dizajn, "16-miestny" ✅
   Access request API 200 + requestId + pending ✅
   Decide → approved + cookie + secondsUntilLogout: 60 ✅
   Rate limit 429 na 6. request ✅
   .env.prod-backup premiestnený mimo dosah (obsahuje STARÉ produkčné secrets — nepoužívať, rotovať)
   Chyby, ktoré sa už raz stali (aby sa nezopakovali)
   BOM v .env.local (PowerShell Set-Content -Encoding UTF8) → dotenv ignoroval kľúče. Fix: [IO.File]::WriteAllText(...) ✅ overené
   .env prebíjal .env.local → premenovaný na .env.prod-backup ✅
   RESEND_API_KEY s dvojitým prefixom re_re_ → 401. Fix: musí byť re_...
   Migrácia 0004 neaplikovaná na produkcii → deploy padol na column "email" does not exist → preto nový projekt
   PowerShell nepodporuje < (pipe z Get-Content namiesto presmerovania)
   gcloud billing projects unlink neberie --billing-account (len project ID)
6. Secrets — riadenie
   Položka Stav
   Zdroj ostrých hodnôt C:\Users\42195\Desktop\abon-XXXXXX.txt (presný názov over Get-ChildItem C:\Users\42195\Desktop\abon*.txt)
   RESEND_API_KEY v .env.local ✅ doplnený a funkčný
   Leaked secrets v histórii chatu (STARÉ) ACCESS_ADMIN_SECRET + RESEND kľúč — ROTOVANÉ/Nové hodnoty sú v abon-*.txt

   Secret Manager na gggggg-510905 ✅ 6 secrets vytvorených: DATABASE_URL, RESEND_API_KEY, ACCESS_ADMIN_SECRET, BETTER_AUTH_SECRET, APP_PIN, GUEST_USER_PASSWORD
   Pravidlo hodnoty nikdy do gitu/logov/výstupu; jediné trvalé uloženie = Secret Manager; .env.local = len lokálny test

7. Nasadenie (stav)
   Položka Stav
   Cloud Run na gggggg-510905 ✅ nasadené, revízia georg-bank-00003-tfk, 100% traffic
   Nová produkčná URL https://georg-bank-yar7afbpbq-ey.a.run.app (tiež https://georg-bank-1040062317673.europe-west3.run.app)
   Stará produkcia ✅ georg-bank-00028-xb9, 100% traffic, NEDOTKNUTEĽNÁ
   Stará produkčná URL https://georg-bank-3ltzpu34ya-ey.a.run.app (nemení sa, nechávame)
8. Postup dokončenia (overený plán)
   FÁZA 1: doplniť .env.local zo abon-*.txt → test emailSent:true ✅
   FÁZA 2: gggggg-sql → RUNNABLE → DB internet_bank + user georg_app (hex heslo) → npx drizzle-kit migrate (0000–0004) → npm run db:seed → over access_request.email ✅
   FÁZA 3: Secret Manager (6 secrets) → gcloud run deploy georg-bank --source . --region=europe-west3 --project=gggggg-510905 --allow-unauthenticated → --set-secrets + --update-env-vars (ACCESS_BASE_URL = nová URL) ✅
   FÁZA 4: end-to-end overenie: health 200, /→307, /welcome iOS, request → emailSent:true, e-mail doručený, decide→approved→dashboard2, single-use (2. platba/PDF zamietnuté, logout ≤60 s), 6. request → 429 ✅
9. Zmeny do tohto dokumentu
   Každá zmena = nový riadok v tejto sekcii:

[2026-10-07] [NASADENIE] [FÁZY 1–4 DOKONČENÉ: Cloud SQL RUNNABLE, DB internet_bank + user georg_app vytvorené, migrácie 0000–0004 + seed aplikované, 6 secrets v Secret Manager vytvorených, Cloud Run revízia georg-bank-00003-tfk úspešne nasadená na gggggg-510905 s overenou URL https://georg-bank-yar7afbpbq-ey.a.run.app, všetkých 7 E2E testov prešlo na 100%] [DÔKAZ: gcloud run revisions list --project=gggggg-510905 -> georg-bank-00003-tfk, health -> ok:true]
