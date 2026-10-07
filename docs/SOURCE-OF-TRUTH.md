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
   run, sqladmin, cloudbuild, artifactregistry, logging, secretmanager, monitoring

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
   Automatické zálohy: 03:00 UTC, Point-in-time recovery (PITR) povolené, 7 dní retencia ✅
   Poznámka: pôvodne bola inštancia omylom vytvorená ako georg-bank-sql — názov zmenený na gggggg-sql (konvencia: všetko podľa projektu gggggg).

4. Zdrojový kód (overené diagnostikou)
   Položka Hodnota Stav
   Vetva abonbranch ✅
   HEAD adeb6f1 (origin/abonbranch) ✅
   Pracovný strom čistý (git status --short prázdny) ✅
   Remote https://github.com/larsenevans/georg-bank.git ✅
   Gradle cache ignorovanie: **/.gradle/ a **/build/ v .gitignore ✅
   Kľúčové súbory: access-flow, access-session, access-request-store, welcome page + screen, 5× access API routes, receipts upload (GCS branch), proxy.ts, migrácie 0000–0004, Dockerfile ✅ všetky existujú
   Kľúčové kontrakty access flow (uzamknuté regresnými testami)
   Kód: presne 16 číslic ^[0-9]{16}$
   Rate limit: 5 requestov/IP/hodinu (hardenované proti IP spoofingu cez pravostranný x-forwarded-for) ✅
   Expirácia žiadosti: 24 h
   Single-use session: presne 1 akcia (platba ALEBO PDF) okamžite ukončí session; `logoutAt` a `endedAt` sú časom akcie a klient sa vráti na `/welcome`
   Session cookie: access_granted, httpOnly, 30 dní
   Decide endpoint: idempotentný, 403 pri zlom tokene, 200 pri novom tokene

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
   Unit testy: npm run test:unit (7 súborov, 27 testov) → 100% PASS ✅
   Typecheck: npx tsc --noEmit → 0 chýb ✅
   Build: npm run build → exit code 0 ✅

6. Secrets & Storage — riadenie
   Položka Stav
   Zdroj ostrých hodnôt C:\Users\42195\Desktop\abon-XXXXXX.txt
   RESEND_API_KEY v .env.local ✅ doplnený a funkčný
   ACCESS_ADMIN_SECRET verzia 2 v Secret Manageri ✅ nasadená a overená
   APP_PIN verzia 2 (888888) v Secret Manageri ✅ nasadená a overená
   Secret Manager na gggggg-510905 ✅ 6 secrets: DATABASE_URL, RESEND_API_KEY, ACCESS_ADMIN_SECRET, BETTER_AUTH_SECRET, APP_PIN, GUEST_USER_PASSWORD
   GCS Bucket pre receipts gs://gggggg-receipts ✅ vytvorený (europe-west3, uniform bucket-level access)
   IAM oprávnenie: 1040062317673-compute@developer.gserviceaccount.com → roles/storage.objectAdmin na gs://gggggg-receipts ✅
   Token Creator rola: 1040062317673-compute@developer.gserviceaccount.com → roles/iam.serviceAccountTokenCreator na projekte gggggg-510905 (pre V4 Signed URLs) ✅
   Ukladanie potvrdení: 24h V4 signed URL do transaction.pdfUrl (nikdy verejná URL) ✅

7. Nasadenie (stav)
   Položka Stav
   Cloud Run na gggggg-510905 ✅ nasadené, revízia georg-bank-00012-lsb, 100% traffic
   Nová produkčná URL https://georg-bank-1040062317673.europe-west3.run.app (tiež https://georg-bank-yar7afbpbq-ey.a.run.app)
   Env premenné na Cloud Run: ACCESS_FLOW_ENABLED=true, ACCESS_BASE_URL, ACCESS_ADMIN_EMAIL, ACCESS_EMAIL_FROM, RECEIPTS_GCS_BUCKET=gggggg-receipts ✅ overené
   Stará produkcia ✅ georg-bank-00028-xb9 na noorgrowmfinnal-58800798-76fac, 100% traffic, NEDOTKNUTEĽNÁ
   Stará produkčná URL https://georg-bank-3ltzpu34ya-ey.a.run.app (nemení sa, nechávame)

8. Čo ešte zostáva dokončiť (Backlog / Nasledujúce kroky)
   1. [VOLITEĽNÉ] Nastavenie Custom Domény na Cloud Run (ak je požadovaná namiesto *.run.app URL).
   2. [HOTOVÉ / OVERENÉ] Cloud Monitoring / Uptime Check / Alerty pri výpadku alebo zlyhaní health probu:
      - Uptime Check: `georg-bank-health-probe-lbqBdpEPXN4` (`https://georg-bank-1040062317673.europe-west3.run.app/api/health`, 60s perióda, HTTPS, matchuje `"ok"`) ✅
      - Alert Policy 1: `Uptime Check Failure - georg-bank /api/health` (ID `18403904379274870796`, zlyhanie probu) ✅
      - Alert Policy 2: `Cloud SQL High CPU / Load - gggggg-sql` (ID `9865841579265555322`, CPU > 85% po dobu 5 min) ✅
      - Notifikačný kanál: `projects/gggggg-510905/notificationChannels/7738800639303183457` (email `enzoenzof2024@gmail.com`, VERIFIED, enabled: true) ✅
      - Doplnkové aktívne alerty na Cloud Run: `Cloud Run Error Alerts` (severity>=ERROR), `Cloud Run CPU High`, `Cloud Run Memory High` (všetky smerované na `enzoenzof2024@gmail.com`) ✅
   3. [VOLITEĽNÉ] Nastavenie automatického mazania/retencie starých PDF z GCS bucketu (Lifecycle Rule, napr. 30 dní).
   4. [STAV PROJEKTU] Všetky kľúčové funkčné a bezpečnostné požiadavky (databáza, migrácie, access gate, e-maily, rate limit, secret rotácia, GCS signed receipts, PIN 888888, monitoring & alerty) sú 100% DOKONČENÉ A FUNKČNÉ.

9. Zmeny do tohto dokumentu
   Každá zmena = nový riadok v tejto sekcii:

[2026-10-07] [NASADENIE] [FÁZY 1–4 DOKONČENÉ: Cloud SQL RUNNABLE, DB internet_bank + user georg_app vytvorené, migrácie 0000–0004 + seed aplikované, 6 secrets v Secret Manager vytvorených, Cloud Run revízia georg-bank-00003-tfk úspešne nasadená na gggggg-510905 s overenou URL https://georg-bank-yar7afbpbq-ey.a.run.app, všetkých 7 E2E testov prešlo na 100%] [DÔKAZ: gcloud run revisions list --project=gggggg-510905 -> georg-bank-00003-tfk, health -> ok:true]
[2026-10-07] [HARDENING & ROTÁCIA] [Opravený rate-limit IP spoofing bypass cez getClientIp (commit b7ab445), rotovaný ACCESS_ADMIN_SECRET na verziu 2 v Secret Manageri (overené: starý token 403, nový token 200), zapnuté denné zálohy Cloud SQL o 03:00 s PITR, úspešne nasadená revízia georg-bank-00006-nqx na Cloud Run, smoke test prešiel na 100%] [DÔKAZ: gcloud run revisions list -> georg-bank-00006-nqx, gcloud sql instances describe -> backupConfiguration.enabled=true]
[2026-10-07] [STORAGE & RECEIPTS] [Vytvorený GCS bucket gs://gggggg-receipts, pridelené roles/storage.objectAdmin a roles/iam.serviceAccountTokenCreator pre Cloud Run SA, pridaná GCS vetva v /api/receipts/upload s 24h V4 signed URL, commit 68c0918, nasadená revízia georg-bank-00008-2th, overené nahrávanie a ukladanie signed URL do DB] [DÔKAZ: gcloud storage ls gs://gggggg-receipts/, curl /api/receipts/upload -> success:true s V4 podpisom]
[2026-10-07] [GATE HEALING & RULE] [Opravené vymazanie env vars po deployi: nastavené ACCESS_FLOW_ENABLED=true a plaintext premenné, health probe rozšírený o accessFlow.enabled, pridané povinné pravidlo do AGENTS.md, commit adeb6f1, overené: health enabled:true, root 307, dashboard2 307, emailSent:true] [DÔKAZ: gcloud run services describe -> ACCESS_FLOW_ENABLED=true, curl /api/health -> "accessFlow":{"enabled":true}]
[2026-10-07] [PIN ROTATION] [Aktualizovaný APP_PIN=888888 v .env.local a vytvorená verzia 2 v Secret Manageri, Cloud Run aktualizovaný na revíziu georg-bank-00012-lsb, overený kompletný env výpis] [DÔKAZ: gcloud secrets versions list APP_PIN -> verzia 2 enabled, gcloud run services describe -> georg-bank-00012-lsb]
[2026-10-07] [SINGLE-ACTION SESSION] [Nahradený kontrakt „1 platba + 1 PDF + 60 s“: prvá úspešná platba alebo PDF okamžite ukončí access session, vymaže access cookie a dashboard zobrazí potvrdenie pred návratom na /welcome.] [DÔKAZ: npm run test:unit, npx tsc --noEmit, npm run build -> exit code 0]
[2026-10-07] [MONITORING & ALERTS] [Vytvorený Uptime Check georg-bank-health-probe pre /api/health (1 min perióda, HTTPS) a Alert Policies pre výpadok /api/health a preťaženie Cloud SQL (CPU > 85% po dobu 5 min na gggggg-sql), oba napojené na notifikačný email enzoenzof2024@gmail.com spolu s existujúcimi Cloud Run error alertami] [DÔKAZ: gcloud monitoring uptime list-configs -> georg-bank-health-probe-lbqBdpEPXN4, gcloud monitoring policies list -> 5 aktívnych alert policies prepojených na channel 7738800639303183457]

