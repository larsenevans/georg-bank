# Project-Scoped Rules

- S používateľom komunikuj v slovenčine, pokiaľ výslovne nepožiada o iný jazyk.
- **Workspace Path**: ALWAYS access this project using the predefined path: `/Users/erikbabcan/Downloads/george-dev`. Never use relative paths or different roots for this workspace. This rule is absolute and must be followed strictly to avoid mistakes.
- **Cloud Run Deploy Env Verification**: Po každom `gcloud run deploy` alebo `services update` VŽDY overiť kompletný env výpis (`gcloud run services describe gro-kan --region=europe-west3 --project=gggggg-510905 --format="yaml(spec.template.spec.containers[0].env)"`) — konkrétne že `ACCESS_FLOW_ENABLED=true` a všetky plaintext premenné (`ACCESS_BASE_URL`, `ACCESS_ADMIN_EMAIL`, `ACCESS_EMAIL_FROM`, `RECEIPTS_GCS_BUCKET`) sedia.

- **REGRESNÉ TESTY CONTRACT-1+1 SÚ ZÁMOK**: ak test zlyhá pri navrhnutej zmene session logiky, zmena je NESPRAVNÁ — session kontrakt (1 platba, 2. platba 403 s odkazom na PDF, PDF = koniec) možno meniť IBA na explicitnú žiadosť používateľa. Týmto je kontrakt uzamknutý na troch miestach: kód (lib/access-session.ts), testy (CONTRACT-1+1), dokument (SOURCE-OF-TRUTH.md + AGENTS.md pravidlo).
