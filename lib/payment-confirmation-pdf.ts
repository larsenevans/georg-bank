export interface PaymentConfirmationPdfData {
  transactionId: string
  createdAt: string
  status: string
  transferType: 'email' | 'external'
  fromAccountNumber: string
  recipientName: string
  recipientAccountOrEmail: string
  amount: string
  currency: string
  variableSymbol: string
  constantSymbol: string
  specificSymbol: string
  note: string
  payerReference: string
  dueDate: string
  repeatDays: string
  createTemplate: boolean
  emailConfirmation: boolean
  balanceBefore: string
  balanceAfter: string
}

function formatBalance(valCents: number): string {
  const val = valCents / 100
  return val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatIban(ibanStr: string): string {
  const clean = ibanStr.replace(/\s+/g, '').toUpperCase()
  if (!clean.startsWith('SK') && !/^[A-Z]{2}\d{2}/.test(clean)) return ibanStr
  const parts = []
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.substring(i, i + 4))
  }
  return parts.join(' ')
}

function getBicFromIban(ibanStr: string): string {
  const cleanIban = ibanStr.replace(/\s+/g, '').toUpperCase()
  if (cleanIban.startsWith('SK') && cleanIban.length >= 8) {
    const bankCode = cleanIban.substring(4, 8)
    const bicMap: Record<string, string> = {
      '0900': 'GIBASKBX', // Slovenská sporiteľňa (SLSP)
      '0200': 'SUBASKBX', // VÚB banka
      '1100': 'TATRSKBX', // Tatra banka
      '1111': 'UNCRSKBX', // UniCredit Bank
      '5600': 'KOISSKBX', // Prima banka
      '7500': 'CEKOSKBX', // ČSOB
      '8360': 'FIOZSKBA', // Fio banka
      '8330': 'FIOZSKBA', // Fio banka
      '6500': '3650SKBX', // 365.bank
      '5200': 'OTPVSKBX', // OTP Banka
      '0720': 'NBSKSRBA', // NBS
    }
    return bicMap[bankCode] || ''
  }
  return ''
}

export function getPaymentConfirmationFilename(
  data: PaymentConfirmationPdfData,
  ext: 'html' | 'pdf' = 'html'
) {
  const vs = (data.variableSymbol || 'bez-vs').replace(/[^\w-]+/g, '')
  const datePart = data.createdAt.split(' ')[0]?.replace(/\./g, '-') || 'datum'
  return `potvrdenie-${vs}-${datePart}.${ext}`
}

export function generatePaymentConfirmationHtml(data: PaymentConfirmationPdfData) {
  const amountCents = Math.round(Number(data.amount) * 100)
  const balanceBeforeCents = Math.round(Number(data.balanceBefore) * 100)
  const balanceAfterCents = Math.round(Number(data.balanceAfter) * 100)

  const cleanDate = (dateStr: string) => {
    if (!dateStr) return ''
    const dateOnly = dateStr.includes(':') ? dateStr.substring(0, dateStr.lastIndexOf(' ', dateStr.indexOf(':'))).trim() : dateStr.trim()
    const parts = dateOnly.replace(/\s+/g, '').split('.')
    if (parts.length >= 3) {
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      const y = parts[2]
      return `${d}.${m}.${y}`
    }
    return dateStr
  }

  const parseToDate = (dateStr: string): Date => {
    if (!dateStr) return new Date()
    const dateOnly = dateStr.includes(':') ? dateStr.substring(0, dateStr.lastIndexOf(' ', dateStr.indexOf(':'))).trim() : dateStr.trim()
    const parts = dateOnly.replace(/\s+/g, '').split('.')
    if (parts.length >= 3) {
      const d = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const y = parseInt(parts[2], 10)
      return new Date(y, m, d, 12, 0, 0)
    }
    return new Date()
  }

  const formatDateSlovakia = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  }

  const transactionDate = parseToDate(data.createdAt)

  const dateValuty = formatDateSlovakia(transactionDate)
  const dateZuctovania = formatDateSlovakia(transactionDate)

  const formattedSenderIban = formatIban(data.fromAccountNumber)
  const formattedRecipientIban = formatIban(data.recipientAccountOrEmail)
  const recipientBic = getBicFromIban(data.recipientAccountOrEmail)

  const name = data.status || 'Štandardný platobný príkaz'
  let subtext = `${formattedRecipientIban} ${data.recipientName}`
  if (recipientBic) {
    subtext += ` BIC: ${recipientBic}`
  }
  if (data.note) {
    subtext += ` | Poznámka: ${data.note}`
  }

  const amountStr = `- ${formatBalance(amountCents)}`
  const balanceAfterStr = formatBalance(balanceAfterCents)
  const balanceBeforeStr = formatBalance(balanceBeforeCents)

  const htmlContent = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Potvrdenie o platbe</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* Základný reset */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body, html {
      margin: 0;
      padding: 0;
      height: 100vh;
      overflow: hidden; /* Zabráni scrollu */
      background: #f0f2f5;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1919;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* --- A4 WRAPPER (SCREEN OBAL) --- */
    .a4-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }

    /* --- A4 DOKUMENT (FIXNÝ ROZMER) --- */
    .a4-document {
      width: 210mm;
      height: 297mm;
      min-width: 210mm;
      min-height: 297mm;
      flex-shrink: 0;
      background: white;
      position: relative;
      box-sizing: border-box;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.08);
      transform-origin: center center;
      transform: scale(var(--scale, 1));
    }

    /* --- OBSAH (SKALOVANÝ) --- */
    .a4-content {
      width: 100%;
      height: 100%;
    }

    /* 1. RESPONZÍVNY ZOBRAZOVACÍ REŽIM (SCREEN) */
    @media screen {
      .page {
        width: 100% !important;
        height: 100% !important;
        background-color: #ffffff;
        position: relative;
        /* 5px higher than the raw 66px/44px margins; the bottom padding takes
           the same 5px so the margin-top:auto footer shifts up as well. */
        padding: 61px 70px 49px 78px;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .vertical-text {
        display: none; /* Na obrazovke skryjeme */
      }
      .details-box {
        background-color: #d4e0e2;
        border-radius: 6px;
        padding: 10px 14px 12px 14px;
        display: grid;
        grid-template-columns: 1.08fr 1fr;
        gap: 28px;
        margin-bottom: 30px;
      }
      .transaction-box {
        border: 1px solid #4e4f4f;
        border-radius: 8px;
        flex-grow: 1;
        box-sizing: border-box;
        padding: 12px;
        background-color: #ffffff;
        margin-bottom: 30px;
      }
      .table-wrapper {
        overflow: visible;
        width: 100%;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }
      .table-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }
    }

    /* 2. PRÍSNY REŽIM PRE TLAČ / PDF (PRINT) */
    @media print {
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: #ffffff;
      }
      .a4-wrapper {
        display: block;
        height: auto;
        width: auto;
        overflow: visible;
      }
      .a4-document {
        width: 210mm;
        height: 297mm;
        min-width: 210mm;
        min-height: 297mm;
        transform: none !important;
        margin: 0;
        box-shadow: none;
      }
      .page {
        width: 100% !important;
        height: 100% !important;
        position: relative;
        padding: 61px 70px 49px 78px !important;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .vertical-text {
        display: block !important;
        position: absolute;
        left: 58px;
        bottom: 113px;
        transform: rotate(-90deg);
        transform-origin: left bottom;
        color: #a6b2b9;
        font-size: 8px;
        font-weight: 500;
        letter-spacing: 0.5px;
      }
      .details-box {
        background-color: #d4e0e2 !important;
        border-radius: 6px;
        padding: 10px 14px 12px 14px !important;
        display: grid !important;
        grid-template-columns: 1.08fr 1fr !important;
        grid-column-gap: 28px !important;
        height: 102px !important;
        margin-bottom: 39px !important;
      }
      .table-wrapper {
        overflow: visible !important;
        width: 100% !important;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }
      .table-container {
        min-width: 0 !important;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }
      .transaction-box {
        border: 1px solid #4e4f4f !important;
        border-radius: 8px !important;
        flex-grow: 1 !important;
        padding: 12px !important;
        background-color: #ffffff !important;
        margin-bottom: 49px !important;
      }
      .transaction-row {
        page-break-inside: avoid;
      }
      /* Pre správne zobrazenie pozadí v tlači Chrome/Edge */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }

    /* 3. SPOLOČNÉ ŠTÝLY (PLatia všade) */
    .header-section { margin-bottom: 22px; }
    .logo-row { display: flex; align-items: flex-start; margin-bottom: 16px; }
    .logo-text-col { display: flex; flex-direction: column; line-height: 1; }
    .logo-main-row { display: flex; align-items: flex-end; }
    .logo-title { font-size: 27px; font-weight: 900; color: #1a1919; letter-spacing: -0.5px; }
    .logo-icon-wrapper { margin-left: 10px; display: flex; align-items: center; }
    .erste-symbol { width: 32px; height: 32px; }
    .logo-subtitle { font-size: 21px; font-weight: 500; color: #1a1919; margin-top: -2px; letter-spacing: -0.3px; }
    .bank-details { font-size: 9.5px; color: #1a1919; line-height: 1.4; font-weight: 500; }
    .document-title { font-size: 19px; font-weight: 700; color: #1a1919; margin-bottom: 6px; }
    
    .details-col { display: flex; flex-direction: column; justify-content: space-between; }
    .details-row { display: flex; align-items: center; position: relative; padding-bottom: 2px; border-bottom: 1.5px solid #8a9fac; height: 20px; box-sizing: border-box; }
    .details-row.row-large { height: 24px; padding-bottom: 3px; }
    .marker { width: 10px; height: 10px; background-color: #536f85; border-radius: 50%; margin-right: 6px; flex-shrink: 0; }
    .label { font-size: 11px; font-weight: 700; color: #1a1919; }
    .value { font-size: 11px; font-weight: 700; color: #1a1919; margin-left: auto; word-break: break-word; }
    .value-large { font-size: 16px; font-weight: 700; color: #000000; margin-left: auto; }
    .value-right { margin-left: auto; }
    
    .info-section { margin-bottom: 7px; display: flex; flex-direction: column; }
    .info-title-row { display: flex; align-items: center; border-bottom: 1.5px solid #8a9fac; width: 326px; max-width: 100%; padding-bottom: 2px; margin-bottom: 10px; }
    .info-title { font-size: 11px; font-weight: 700; color: #1a1919; }
    .info-body { font-size: 12.5px; color: #1a1919; line-height: 1.4; font-weight: 500; }
    
    .table-header { background-color: #d4e0e2; border: 1px solid #4e4f4f; border-top-left-radius: 8px; border-top-right-radius: 8px; height: 37px; display: grid; grid-template-columns: 85px 95px 1fr 110px; box-sizing: border-box; align-items: center; padding: 0 12px; margin-bottom: 10px; gap: 8px; }
    .header-cell { font-size: 10px; font-weight: 800; color: #1a1919; line-height: 1.1; }
    .cell-left { text-align: left; }
    .cell-right { text-align: right; padding-right: 20px; }
    .transaction-row { display: grid; grid-template-columns: 85px 95px 1fr 110px; align-items: start; box-sizing: border-box; gap: 8px; }
    .body-cell { font-size: 12px; color: #1a1919; line-height: 1.25; word-break: break-word; }
    
    .popis-cell { display: flex; flex-direction: column; }
    .popis-title { font-weight: 700; margin-bottom: 2px; }
    .popis-subtext { font-size: 11px; color: #1a1919; font-weight: 400; }
    
    .footer { display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; padding: 0 2px; margin-top: auto; flex-wrap: wrap; gap: 10px; }
    .footer-item { font-size: 11px; font-weight: 700; color: #1a1919; }
  </style>
</head>
<body>
  <div class="a4-wrapper">
    <div class="a4-document">
      <div class="a4-content">
        <div class="page">
          <div class="vertical-text">MO10_v203_1000280073</div>
          <div class="header-section">
            <div class="logo-row">
              <div class="logo-text-col">
                <div class="logo-main-row">
                  <span class="logo-title">SLOVENSKÁ</span>
                </div>
                <span class="logo-subtitle">sporiteľňa</span>
              </div>
            </div>
            <div class="bank-details">
              Slovenská sporiteľňa, a.s.<br>
              Tomášikova 48, 832 37 Bratislava<br>
              IČO 00 151 653, zapísaná v Obchodnom registri<br>
              Mestského súdu Bratislava III., oddiel Sa, vložka č. 601/B
            </div>
          </div>

          <div class="document-title">Výpis z Účtu:</div>

          <div class="details-box">
            <div class="details-col">
              <div class="details-row row-large">
                <span class="marker"></span>
                <span class="label">Názov Účtu</span>
                <span class="value value-large">Peter Novotný</span>
              </div>
              <div class="details-row">
                <span class="marker"></span>
                <span class="label">Číslo Účtu</span>
                <span class="value">${formattedSenderIban}</span>
              </div>
              <div class="details-row">
                <span class="marker"></span>
                <span class="label">BIC</span>
                <span class="value value-right">GIBASKBX</span>
              </div>
              <div class="details-row">
                <span class="marker"></span>
                <span class="label">Mena</span>
                <span class="value value-right">${data.currency}</span>
              </div>
            </div>
            <div class="details-col">
              <div class="details-row row-large">
                <span class="marker"></span>
                <span class="label">Účtovné obdobie</span>
                <span class="value">${cleanDate(data.createdAt)}</span>
              </div>
              <div class="details-row" style="border-bottom: none; height: 20px;"></div>
              <div class="details-row">
                <span class="marker"></span>
                <span class="label">Vklady spolu</span>
                <span class="value">0,00</span>
              </div>
              <div class="details-row">
                <span class="marker"></span>
                <span class="label">Výbery spolu</span>
                <span class="value">- ${formatBalance(amountCents)}</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="info-title-row">
              <span class="marker"></span>
              <span class="info-title">Informácia pre klienta</span>
            </div>
            <div class="info-body">
              Autorizované dňa ${data.createdAt} cez George kľúč (mToken)
            </div>
          </div>

          <div class="table-container">
            <div class="table-wrapper">
              <div class="table-header">
                <div class="header-cell cell-left">Dátum<br>valuty</div>
                <div class="header-cell cell-left">Dátum<br>zúčtovania</div>
                <div class="header-cell cell-left">Popis<br>transakcie</div>
                <div class="header-cell cell-right">Suma<br>transakcie</div>
              </div>

              <div class="transaction-box">
                <div class="transaction-row">
                  <div class="body-cell cell-left">${dateValuty}</div>
                  <div class="body-cell cell-left">${dateZuctovania}</div>
                  <div class="body-cell cell-left popis-cell">
                    <span class="popis-title">${name}</span>
                    <span class="popis-subtext">${subtext}</span>
                  </div>
                  <div class="body-cell cell-right">${amountStr}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="footer-item">info@slsp.sk</div>
            <div class="footer-item">Klientske centrum: 0850 111 888</div>
            <div class="footer-item">www.slsp.sk</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const documentEl = document.querySelector('.a4-document');

      if (!documentEl) return;

      function calculateScale() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const docWidth = 210; // mm
        const docHeight = 297; // mm

        // Prevod mm na px (96 DPI = 3.7795275591 px/mm)
        const pxWidth = docWidth * 3.7795275591;
        const pxHeight = docHeight * 3.7795275591;

        // Vypocet scale s 10px paddingom z kazdej strany
        const scale = Math.min(
          (vw - 20) / pxWidth,
          (vh - 20) / pxHeight
        );

        // Limitujeme maximalnu mierku na 1, aby sa na desktope nezvacsoval nad standardnu velkost
        documentEl.style.setProperty('--scale', Math.max(0.1, Math.min(scale, 1)));
      }

      window.addEventListener('load', calculateScale);
      window.addEventListener('resize', calculateScale);
      calculateScale();
      setTimeout(calculateScale, 100);
    })();
  </script>
</body>
</html>`

  return htmlContent
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/** Strip remote font CSS so headless/canvas capture does not hang on CDN. */
function htmlForPdfCapture(html: string): string {
  return html
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi, '')
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/gi, '')
    .replace(
      /font-family:\s*'Inter',\s*-apple-system/g,
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    )
}

async function deliverBlobFile(
  blob: Blob,
  filename: string,
  mime: string,
  title = 'Potvrdenie o platbe'
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const file = new File([blob], filename, { type: mime })
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data?: ShareData) => Promise<void>
  }
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title, text: filename })
        return
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

const PDF_CONVERT_TIMEOUT_MS = 12_000

/** Render confirmation HTML into an offscreen A4 frame and convert to PDF blob. */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('htmlToPdfBlob requires a browser environment')
  }

  return withTimeout(htmlToPdfBlobInner(html), PDF_CONVERT_TIMEOUT_MS, 'htmlToPdfBlob')
}

async function htmlToPdfBlobInner(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const host = document.createElement('div')
  host.setAttribute('data-pdf-render-host', '1')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;overflow:hidden;pointer-events:none;opacity:1;z-index:-1;background:#fff;'
  document.body.appendChild(host)

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'border:0;width:210mm;height:297mm;background:#fff;'
  host.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('PDF iframe document unavailable')

    doc.open()
    doc.write(htmlForPdfCapture(html))
    doc.close()

    await new Promise<void>((resolve) => {
      if (iframe.contentWindow?.document.readyState === 'complete') {
        resolve()
        return
      }
      iframe.onload = () => resolve()
      window.setTimeout(() => resolve(), 800)
    })

    const fonts = iframe.contentDocument?.fonts
    if (fonts?.ready) {
      try {
        await withTimeout(Promise.resolve(fonts.ready), 1500, 'document.fonts.ready')
      } catch {
        /* ignore font wait failures / timeouts */
      }
    }
    await new Promise((r) => window.setTimeout(r, 50))

    const page =
      (iframe.contentDocument?.querySelector('.a4-document') as HTMLElement | null) ||
      (iframe.contentDocument?.body as HTMLElement | null)
    if (!page) throw new Error('PDF source page not found')

    // Disable screen scaling so capture uses full A4 layout size.
    page.style.setProperty('--scale', '1')
    page.style.transform = 'none'

    const canvas = await withTimeout(
      html2canvas(page, {
        useCORS: true,
        allowTaint: true,
        background: '#ffffff',
        logging: false,
        width: Math.max(page.scrollWidth, 794),
        height: Math.max(page.scrollHeight, 1123),
      }),
      8_000,
      'html2canvas'
    )

    const imgData = canvas.toDataURL('image/jpeg', 0.88)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

/**
 * Stiahne HTML potvrdenie o platbe (fallback / legacy).
 */
export async function downloadPaymentConfirmationHtml(data: PaymentConfirmationPdfData) {
  const htmlContent = generatePaymentConfirmationHtml(data)
  const filename = getPaymentConfirmationFilename(data, 'html')
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  await deliverBlobFile(blob, filename, 'text/html;charset=utf-8')
}

/** Build PDF blob from confirmation data (no download). */
export async function buildPaymentConfirmationPdfBlob(
  data: PaymentConfirmationPdfData
): Promise<{ blob: Blob; filename: string; html: string }> {
  const html = generatePaymentConfirmationHtml(data)
  const blob = await htmlToPdfBlob(html)
  const filename = getPaymentConfirmationFilename(data, 'pdf')
  return { blob, filename, html }
}

/**
 * Convert HTML confirmation → PDF and deliver via share/download.
 * On canvas/PDF failure, falls back to HTML download.
 * E2E can force HTML via `window.__GEORGE_FORCE_HTML_RECEIPT__ = true`.
 */
export async function downloadPaymentConfirmationAsPdf(
  data: PaymentConfirmationPdfData
): Promise<{ ok: boolean; blob?: Blob; filename?: string; usedHtmlFallback?: boolean }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false }
  }

  const forceHtml =
    (window as Window & { __GEORGE_FORCE_HTML_RECEIPT__?: boolean }).__GEORGE_FORCE_HTML_RECEIPT__ ===
    true

  try {
    if (forceHtml) {
      throw new Error('forced HTML receipt for e2e')
    }
    const { blob, filename } = await buildPaymentConfirmationPdfBlob(data)
    await deliverBlobFile(blob, filename, 'application/pdf')
    return { ok: true, blob, filename }
  } catch (err) {
    console.warn('[payment-confirmation] PDF convert failed, falling back to HTML:', err)
    await downloadPaymentConfirmationHtml(data)
    return { ok: false, usedHtmlFallback: true }
  }
}

/** @deprecated Prefer downloadPaymentConfirmationAsPdf — kept for existing imports. */
export async function downloadPaymentConfirmationPdf(data: PaymentConfirmationPdfData) {
  await downloadPaymentConfirmationAsPdf(data)
}

export function openPaymentConfirmationHtml(data: PaymentConfirmationPdfData) {
  const htmlContent = generatePaymentConfirmationHtml(data)
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
