'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  downloadPaymentConfirmationAsPdf,
  downloadPaymentConfirmationHtml,
  type PaymentConfirmationPdfData,
} from '@/lib/payment-confirmation-pdf'
import { PdfGenerateOverlay } from '@/components/pdf-generate-overlay'
import { DashboardHeader } from '@/components/dashboard-header'
import { useSession } from '@/lib/auth-client'
import { PaymentQrScanner } from '@/components/PaymentQrScanner'
import { QrPaymentPreview } from '@/components/QrPaymentPreview'
import { PaymentDraft, PaymentOption, QrDecodingResult } from '@/types/payment'
import {
  DAILY_PAYMENT_LIMIT_EUR,
  isOutgoingPaymentType,
  startOfLocalDay,
} from '@/lib/daily-payment-limit'
import { DEMO_ACCOUNT_NUMBER } from '@/lib/demo-user'
import { notifyPohybyLive } from '@/lib/pohyby-live'
import { syncWidgetFromTransactionsApi } from '@/lib/widget'

type TransactionType = 'outgoing' | 'incoming' | 'deposit' | 'transfer'
type TransactionFilter = 'all' | 'incoming' | 'outgoing' | 'deposit'

interface Transaction {
  id: string
  recipient: string
  amount: number // záporné = odchádzajúca, kladné = prichádzajúca
  date: string // 'Dnes' / 'Včera' / 'dd.mm.yyyy'
  createdAt?: string
  note?: string
  iban?: string
  vs?: string
  type?: TransactionType
  status?: string
  balanceBefore?: number
  balanceAfter?: number
  category?: string
  pdfUrl?: string | null
}

const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: 'seed-tesco',
    recipient: 'Tesco',
    amount: -14.99,
    date: 'Dnes',
    createdAt: new Date().toISOString(),
    type: 'outgoing',
    status: 'Spracované',
    category: 'Potraviny',
    note: 'Platba kartou',
  },
  {
    id: 'seed-o2',
    recipient: 'O2 Slovensko',
    amount: -20.0,
    date: 'Včera',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    type: 'outgoing',
    status: 'Spracované',
    category: 'Telekomunikácie',
    note: 'Faktúra',
  },
  {
    id: 'seed-payroll',
    recipient: 'Výplata sporiteľňa',
    amount: 6660.0,
    date: '10.07.2026',
    createdAt: '2026-07-10T08:00:00.000Z',
    type: 'incoming',
    status: 'Spracované',
    category: 'Príjem',
    note: 'Mzda',
  },
]

/** Parse "Name (note) IBAN: SK… VS: 123" from API description blobs. */
function parseMovementDescription(description: string | undefined | null): {
  recipient: string
  note?: string
  iban?: string
  vs?: string
} {
  const raw = (description || '').trim()
  if (!raw) return { recipient: 'Neznáma transakcia' }

  const ibanMatch = raw.match(/IBAN:\s*([A-Za-z0-9 ]+?)(?=\s+(?:VS|CS|SS):|\s*$)/i)
  const vsMatch = raw.match(/VS:\s*([A-Za-z0-9]+)/i)
  const head = raw
    .replace(/\s*IBAN:\s*[A-Za-z0-9 ]+?(?=\s+(?:VS|CS|SS):|\s*$)/i, '')
    .replace(/\s*VS:\s*[A-Za-z0-9]+/i, '')
    .trim()
  const noteMatch = head.match(/^(.*?)\s*\((.*)\)\s*$/)
  if (noteMatch) {
    return {
      recipient: noteMatch[1].trim() || 'Neznáma transakcia',
      note: noteMatch[2].trim() || undefined,
      iban: ibanMatch?.[1]?.replace(/\s+/g, '').toUpperCase(),
      vs: vsMatch?.[1],
    }
  }
  return {
    recipient: head || 'Neznáma transakcia',
    iban: ibanMatch?.[1]?.replace(/\s+/g, '').toUpperCase(),
    vs: vsMatch?.[1],
  }
}

function normalizeTransaction(raw: Partial<Transaction> & { recipient?: string; amount?: number }): Transaction {
  const rawAmount = Number(raw.amount ?? 0)
  const inferredType: TransactionType =
    raw.type ??
    (rawAmount < 0 ? 'outgoing' : rawAmount > 0 && raw.recipient?.toLowerCase().includes('dobitie')
      ? 'deposit'
      : rawAmount > 0
        ? 'incoming'
        : 'outgoing')

  // DB stores outgoing amounts as positive cents; UI uses negative for outgoing.
  const amount =
    inferredType === 'outgoing' || inferredType === 'transfer'
      ? -Math.abs(rawAmount)
      : Math.abs(rawAmount)

  const parsed = parseMovementDescription(raw.recipient || raw.note)

  return {
    id: raw.id || `legacy-${Math.random().toString(36).slice(2, 10)}`,
    recipient: parsed.recipient !== 'Neznáma transakcia' ? parsed.recipient : raw.recipient || 'Neznáma transakcia',
    amount,
    date: raw.date || 'Dnes',
    createdAt: raw.createdAt || new Date().toISOString(),
    note: raw.note && !raw.note.includes('IBAN:') ? raw.note : parsed.note,
    iban: raw.iban || parsed.iban,
    vs: raw.vs || parsed.vs,
    type: inferredType,
    status: raw.status || 'Spracované',
    balanceBefore: raw.balanceBefore,
    balanceAfter: raw.balanceAfter,
    category: raw.category,
    pdfUrl: raw.pdfUrl ?? null,
  }
}

function newTxnId(prefix = 'txn') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function GeorgePrototypePage() {
  const { data: sessionData } = useSession()
  const user = sessionData?.user ?? { name: 'Peter', email: 'peter@example.com', image: null }

  // GLOBÁLNY STAV
  const [state, setState] = useState({
    spaceBalance: 0.53,
    moneybackBalance: 0.00,
    investBalance: 0.00,
    activeTab: 'prehlad',
    transactions: SEED_TRANSACTIONS as Transaction[],
    /** Sender IBAN for payment receipts — never the legacy fake SK90…98765432. */
    accountNumber: DEMO_ACCOUNT_NUMBER,
  })

  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false)
  const [payRecipient, setPayRecipient] = useState('')
  const [payIban, setPayIban] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payVs, setPayVs] = useState('')
  const [payNote, setPayNote] = useState('')

  // QR Code Scanning State
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [showQrPreview, setShowQrPreview] = useState(false)
  const [scannedDraft, setScannedDraft] = useState<PaymentDraft | null>(null)
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [modalType, setModalType] = useState<'profile-modal' | 'moneyback-modal' | 'cards-modal' | null>(null)
  const [isDemoDrawerOpen, setIsDemoDrawerOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('Notifikácia úspešne doručená!')
  const [isToastVisible, setIsToastVisible] = useState(false)
  const [toastTimeoutId, setToastTimeoutId] = useState<NodeJS.Timeout | null>(null)

  const [contactMessage, setContactMessage] = useState('')
  const [slovenskoNumber, setSlovenskoNumber] = useState('0850 111 888')
  const [zahranicieNumber, setZahranicieNumber] = useState('+421 2 48 62 66')
  const [isLoaded, setIsLoaded] = useState(false)
  const [pdfOverlayOpen, setPdfOverlayOpen] = useState(false)
  const [pdfOverlayPhase, setPdfOverlayPhase] = useState<'preparing' | 'done'>('preparing')
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  // GEORGE PRIHLASOVACIE STAVY
  const [isSimulatorLoggedIn, setIsSimulatorLoggedIn] = useState(false)
  const [isPasscodeScreen, setIsPasscodeScreen] = useState(true)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [usePasswordInput, setUsePasswordInput] = useState(false)
  const [textPassword, setTextPassword] = useState('')

  // BIOMETRIA TVÁROU (FACE ID) CEZ WEB_KAMERU (FACE-API)
  const [isBiometricsActive, setIsBiometricsActive] = useState(false)
  const [biometricsSuccess, setBiometricsSuccess] = useState(false)
  const [faceapiLoaded, setFaceapiLoaded] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)

  const cameraStreamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null)

  interface FaceApiInstance {
    tf?: {
      setBackend?: (backendName: string) => Promise<boolean>;
      ready?: () => Promise<void>;
    };
    nets?: {
      tinyFaceDetector?: {
        isLoaded?: boolean;
        loadFromUri?: (uri: string) => Promise<void>;
      };
    };
    detectSingleFace: (
      input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
      options?: unknown
    ) => Promise<unknown>;
    TinyFaceDetectorOptions: new (options?: { inputSize?: number; scoreThreshold?: number }) => unknown;
  }

  /** Po načítaní face-api musí byť TensorFlow backend ready pred loadFromUri / detect. */
  const ensureTfReady = async (faceapi: FaceApiInstance) => {
    const tf = faceapi?.tf
    if (!tf) return
    // Prefer WebGL over WASM (WASM backend error if not fully initialized).
    if (typeof tf.setBackend === 'function') {
      try {
        await tf.setBackend('webgl')
      } catch {
        try {
          await tf.setBackend('cpu')
        } catch {
          // keep library default
        }
      }
    }
    if (typeof tf.ready === 'function') {
      await tf.ready()
    }
  }

  const loadFaceModels = async (faceapi: FaceApiInstance) => {
    await ensureTfReady(faceapi)
    // Avoid re-loading if already present
    const net = faceapi.nets?.tinyFaceDetector
    if (net?.isLoaded) {
      setModelsLoaded(true)
      return faceapi
    }
    if (faceapi.nets?.tinyFaceDetector?.loadFromUri) {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
    }
    setModelsLoaded(true)
    return faceapi
  }

  // Dynamicky načítať face-api a modely
  const initFaceApi = async (): Promise<FaceApiInstance | null> => {
    if (typeof window === 'undefined') return null

    const win = window as unknown as Record<string, FaceApiInstance | undefined>
    if (faceapiLoaded && modelsLoaded && win.faceapi) {
      return win.faceapi
    }

    try {
      let faceapi = win.faceapi

      if (!faceapi) {
        showToast('Načítavam biometrické modely...')
        faceapi = await new Promise<FaceApiInstance | undefined>((resolve, reject) => {
          const existing = document.getElementById('face-api-script') as HTMLScriptElement | null
          if (existing) {
            // Script tag exists but global not ready yet – wait for load
            existing.addEventListener('load', () => {
              const w = window as unknown as Record<string, FaceApiInstance | undefined>
              resolve(w.faceapi)
            }, { once: true })
            existing.addEventListener('error', () => reject(new Error('face-api script failed')), { once: true })
            // Already loaded earlier
            const w = window as unknown as Record<string, FaceApiInstance | undefined>
            if (w.faceapi) resolve(w.faceapi)
            return
          }

          const script = document.createElement('script')
          script.id = 'face-api-script'
          script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js'
          script.async = true
          script.onload = () => {
            const w = window as unknown as Record<string, FaceApiInstance | undefined>
            resolve(w.faceapi)
          }
          script.onerror = () => reject(new Error('face-api script failed'))
          document.body.appendChild(script)
        })
      }

      if (!faceapi) {
        showToast('Nepodarilo sa načítať biometrickú knižnicu.')
        return null
      }

      setFaceapiLoaded(true)
      await loadFaceModels(faceapi)
      return faceapi
    } catch (err) {
      console.error('Chyba načítania face-api / modelov:', err)
      showToast('Nepodarilo sa načítať modely pre biometriu.')
      return null
    }
  }

  const stopWebcam = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop())
      cameraStreamRef.current = null
    }
    setIsCameraActive(false)
  }

  const cancelBiometrics = () => {
    stopWebcam()
    setIsBiometricsActive(false)
    setBiometricsSuccess(false)
  }

  const waitForVideoEl = async (timeoutMs = 2500): Promise<HTMLVideoElement | null> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (videoRef.current) return videoRef.current
      await new Promise((r) => setTimeout(r, 50))
    }
    return videoRef.current
  }

  const startFaceDetection = () => {
    const win = window as unknown as Record<string, FaceApiInstance | undefined>
    const faceapi = win.faceapi
    if (!faceapi) return

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }

    let detectionCount = 0
    let busy = false

    detectionIntervalRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || !cameraStreamRef.current || busy) return
      if (video.readyState < 2) return // HAVE_CURRENT_DATA

      busy = true
      try {
        const detection = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
        )

        if (detection) {
          detectionCount++
          // 3× po sebe (~900 ms) = spoľahlivejšie než 2×
          if (detectionCount >= 3) {
            if (detectionIntervalRef.current) {
              clearInterval(detectionIntervalRef.current)
              detectionIntervalRef.current = null
            }
            setBiometricsSuccess(true)
            stopWebcam()

            setTimeout(() => {
              setIsSimulatorLoggedIn(true)
              setIsBiometricsActive(false)
              setBiometricsSuccess(false)
              // bez toastu – rovnako ako PIN
            }, 900)
          }
        } else {
          detectionCount = 0
        }
      } catch (e) {
        console.error('Detection error:', e)
      } finally {
        busy = false
      }
    }, 300)
  }

  const triggerBiometrics = async () => {
    // 1) Overlay najprv (aby sa namountoval <video ref>)
    setIsBiometricsActive(true)
    setBiometricsSuccess(false)
    setIsCameraActive(false)

    const faceapi = await initFaceApi()
    if (!faceapi) {
      cancelBiometrics()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Prehliadač nepodporuje webkameru. Použite PIN kód 666666.')
      cancelBiometrics()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 320 },
          facingMode: 'user',
        },
        audio: false,
      })

      cameraStreamRef.current = stream
      setIsCameraActive(true)

      // 2) Počkaj na mount <video>, priraď stream, až potom detekcia
      const video = await waitForVideoEl()
      if (!video) {
        showToast('Nepodarilo sa spustiť náhľad kamery. Skúste znova alebo PIN.')
        cancelBiometrics()
        return
      }

      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      try {
        await video.play()
      } catch (e) {
        console.error('Video play error:', e)
      }

      // počkaj na prvý frame
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const done = () => resolve()
          video.addEventListener('loadeddata', done, { once: true })
          setTimeout(done, 2000)
        })
      }

      startFaceDetection()
    } catch (err) {
      // NotAllowedError is expected in Simulator / denied camera — do not console.error
      // (Next.js Dev Overlay treats console.error as a blocking "Issue").
      const name = err instanceof DOMException ? err.name : ''
      if (name !== 'NotAllowedError') {
        console.warn('Camera access error:', err)
      }
      showToast('Webkamera je nedostupná alebo prístup bol zamietnutý. Použite PIN kód 666666.')
      cancelBiometrics()
    }
  }

  useEffect(() => {
    return () => {
      stopWebcam()
    }
  }, [])

  // PWA / iOS home-screen / Capacitor → force full-bleed (no desktop phone frame)
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const mqStandalone = window.matchMedia('(display-mode: standalone)')
    const mqMinimal = window.matchMedia('(display-mode: minimal-ui)')
    const mqFullscreen = window.matchMedia('(display-mode: fullscreen)')

    const sync = () => {
      const isStandalone =
        mqStandalone.matches ||
        mqMinimal.matches ||
        mqFullscreen.matches ||
        nav.standalone === true ||
        Boolean((window as Window & { Capacitor?: unknown }).Capacitor) ||
        /Capacitor/i.test(nav.userAgent)
      document.documentElement.classList.toggle('d2-standalone', isStandalone)
    }

    sync()
    mqStandalone.addEventListener('change', sync)
    mqMinimal.addEventListener('change', sync)
    mqFullscreen.addEventListener('change', sync)
    return () => {
      mqStandalone.removeEventListener('change', sync)
      mqMinimal.removeEventListener('change', sync)
      mqFullscreen.removeEventListener('change', sync)
      document.documentElement.classList.remove('d2-standalone')
    }
  }, [])

  // Načítanie stavu a transakcií cez /api/transactions (+ localStorage fallback)
  useEffect(() => {
    const controller = new AbortController()

    const loadFromDb = async () => {
      try {
        const res = await fetch('/api/transactions', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            const accBalance =
              data.accounts?.[0]?.balance !== undefined
                ? data.accounts[0].balance / 100
                : undefined
            const accNumber =
              typeof data.accounts?.[0]?.accountNumber === 'string' &&
              data.accounts[0].accountNumber.trim()
                ? String(data.accounts[0].accountNumber).replace(/\s+/g, '').toUpperCase()
                : undefined
            const rawTxns = Array.isArray(data.transactions) ? data.transactions : []
            if (rawTxns.length > 0) {
              setState((prev) => ({
                ...prev,
                spaceBalance: accBalance ?? prev.spaceBalance,
                accountNumber: accNumber ?? prev.accountNumber,
                transactions: rawTxns.map((t: Partial<Transaction>) => normalizeTransaction(t)),
              }))
              void syncWidgetFromTransactionsApi({
                transactions: rawTxns,
                dailyLimit: data.dailyLimit,
                accounts: data.accounts,
              })
              setIsLoaded(true)
              return
            }
            // No txns yet, but seeded demo account balance (CI / ensure-db)
            if (accBalance !== undefined || accNumber) {
              setState((prev) => ({
                ...prev,
                spaceBalance: accBalance ?? prev.spaceBalance,
                accountNumber: accNumber ?? prev.accountNumber,
              }))
              void syncWidgetFromTransactionsApi({
                transactions: [],
                dailyLimit: data.dailyLimit,
                accounts: data.accounts,
              })
            }
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Chyba pri načítaní /api/transactions:', msg, e)
      }

      if (controller.signal.aborted) return

      try {
        const saved = localStorage.getItem('george_pwa_state')
        if (saved) {
          const parsed = JSON.parse(saved)
          const age = Date.now() - (parsed.timestamp || 0)

          if (age < 1209600000) {
            const rawTxns = Array.isArray(parsed.transactions) ? parsed.transactions : []
            setState(prev => ({
              ...prev,
              spaceBalance: parsed.spaceBalance ?? prev.spaceBalance,
              moneybackBalance: parsed.moneybackBalance ?? prev.moneybackBalance,
              investBalance: parsed.investBalance ?? prev.investBalance,
              transactions: rawTxns.length
                ? rawTxns.map((t: Partial<Transaction>) => normalizeTransaction(t))
                : prev.transactions,
            }))
          }
        }
      } catch (e) {
        console.error('Chyba pri načítaní stavu z localStorage:', e)
      } finally {
        if (!controller.signal.aborted) setIsLoaded(true)
      }
    }
    void loadFromDb()

    return () => controller.abort()

    // Push / browser notifications disabled on dashboard2 (were spamming /api/push/send).
  }, [])

  // Ukladanie stavu pri každej zmene zostatkov alebo histórie (po úspešnom načítaní)
  useEffect(() => {
    if (!isLoaded) return

    try {
      const stateToSave = {
        spaceBalance: state.spaceBalance,
        moneybackBalance: state.moneybackBalance,
        investBalance: state.investBalance,
        transactions: state.transactions,
        timestamp: Date.now()
      }
      localStorage.setItem('george_pwa_state', JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Chyba pri ukladaní stavu do localStorage:', e)
    }
  }, [state.spaceBalance, state.moneybackBalance, state.investBalance, state.transactions, isLoaded])

  useEffect(() => {
    // Generovanie náhodných čísel pre klientsku linku
    const randomSlovensko = `0850 ${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`
    const randomDigits = Math.floor(10 + Math.random() * 90)
    const randomZahranicie = `+421 2 48 62 ${randomDigits}`

    setSlovenskoNumber(randomSlovensko)
    setZahranicieNumber(randomZahranicie)
  }, [])

  const switchTab = (tabId: string) => {
    setState(prev => ({ ...prev, activeTab: tabId }))
  }

  const openPaymentSheet = () => {
    setIsPaymentSheetOpen(true)
  }

  const closePaymentSheet = () => {
    setIsPaymentSheetOpen(false)
    setPayRecipient('')
    setPayIban('')
    setPayAmount('')
    setPayVs('')
    setPayNote('')
  }

  // QR Code Scanning Handlers
  const handleScanSuccess = useCallback((draft: PaymentDraft) => {
    setShowQrScanner(false)
    setShowQrPreview(false)
    setScannedDraft(null)

    // Directly populate all available fields in the "Nová platba" form
    setPayRecipient(draft.recipientName || '')
    setPayIban(draft.iban || '')
    setPayAmount(draft.amount !== null && draft.amount !== undefined ? draft.amount.toFixed(2) : '')
    setPayVs(draft.variableSymbol ? draft.variableSymbol.substring(0, 10) : '')
    setPayNote(draft.note ? draft.note.substring(0, 140) : '')

    showToast('Údaje z QR kódu boli vyplnené do formulára!')
  }, [])

  const handleScanError = useCallback((error: Error) => {
    console.error('QR scanning error:', error)
    showToast(`Chyba pri skenovaní: ${error.message}`)
  }, [])

  const handleScannerClose = useCallback(() => {
    setShowQrScanner(false)
  }, [])

  const handleSendMoneyFromPreview = useCallback((draft: PaymentDraft) => {
    setShowQrPreview(false)
    setPayRecipient(draft.recipientName)
    setPayIban(draft.iban)
    setPayAmount(draft.amount?.toFixed(2) || '')
    setPayVs(draft.variableSymbol || '')
    setPayNote(draft.note || '')
    showToast('Platba predvyplnená z QR kódu!')
  }, [])

  const handleScanAgain = useCallback(() => {
    setShowQrPreview(false)
    setScannedDraft(null)
    setPaymentOptions([])
    setShowQrScanner(true)
  }, [])

  const handleOptionSelect = useCallback((draft: PaymentDraft) => {
    setScannedDraft(draft)
  }, [])

  const handleSaveContactFromPreview = useCallback((draft: PaymentDraft) => {
    showToast(`Kontakt ${draft.recipientName} uložený!`)
  }, [])

  const openQrScanner = useCallback(() => {
    setShowQrScanner(true)
  }, [])

  const getTodayOutgoingUsed = (txns: Transaction[]) => {
    const dayStart = startOfLocalDay().getTime()
    return txns.reduce((sum, txn) => {
      if (txn.amount >= 0 && !isOutgoingPaymentType(txn.type)) return sum
      const created = txn.createdAt ? new Date(txn.createdAt).getTime() : Date.now()
      if (created < dayStart) return sum
      return sum + Math.abs(txn.amount)
    }, 0)
  }

  const executeMockPayment = async () => {
    const recipient = payRecipient.trim()
    const iban = payIban.trim()
    const amount = parseFloat(payAmount)
    const vs = payVs.trim()
    const note = payNote.trim()

    if (!recipient || !iban || isNaN(amount) || amount <= 0) {
      showToast('Prosím vyplňte správne meno príjemcu, IBAN a kladnú sumu.')
      return
    }

    if (amount > state.spaceBalance) {
      showToast('Nedostatok vlastných zdrojov na SPACE účte pre túto platbu.')
      return
    }

    const usedToday = getTodayOutgoingUsed(state.transactions)
    const remaining = Math.max(0, DAILY_PAYMENT_LIMIT_EUR - usedToday)
    if (amount > remaining) {
      showToast(
        `Limit 24 h: ${DAILY_PAYMENT_LIMIT_EUR.toFixed(0)} €. Zostáva ${remaining.toFixed(2)} €.`
      )
      return
    }

    const balanceBefore = state.spaceBalance
    const balanceAfter = state.spaceBalance - amount
    const optimisticId = newTxnId('pay')
    const createdAtLabel = new Date().toLocaleString('sk-SK')

    // Persist first so /pohyby sees the outgoing payment immediately.
    let serverTxn: Partial<Transaction> & { id?: string } = {}
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          iban,
          vs,
          amount,
          note,
          type: 'outgoing',
          category: 'Nezaradené výdavky',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        showToast(
          data.error ||
            `Platbu sa nepodarilo zapísať (limit 24 h ${DAILY_PAYMENT_LIMIT_EUR} €).`
        )
        return
      }
      serverTxn = data.transaction || {}
      // Instant push to open /pohyby tabs
      notifyPohybyLive({ type: 'payment', transactionId: serverTxn.id || optimisticId })
    } catch (err) {
      console.warn('[dashboard2] DB persist error:', err)
      showToast('Chyba siete — platba nebola zapísaná do dashboardu.')
      return
    }

    const txnId = serverTxn.id || optimisticId
    const createdAt = serverTxn.createdAt || new Date().toISOString()
    const newTxn: Transaction = {
      id: txnId,
      recipient,
      amount: -amount,
      date: 'Dnes',
      createdAt,
      note: note || undefined,
      iban,
      vs: vs || undefined,
      type: 'outgoing',
      status: 'Spracované',
      balanceBefore: serverTxn.balanceBefore ?? balanceBefore,
      balanceAfter: serverTxn.balanceAfter ?? balanceAfter,
      category: 'Nezaradené výdavky',
    }

    setState((prev) => ({
      ...prev,
      spaceBalance: newTxn.balanceAfter ?? balanceAfter,
      transactions: [newTxn, ...prev.transactions],
    }))

    void syncWidgetFromTransactionsApi({
      transactions: [newTxn, ...state.transactions],
      accounts: [
        {
          balance: Math.round((newTxn.balanceAfter ?? balanceAfter) * 100),
        },
      ],
    })

    closePaymentSheet()
    setTransactionFilter('all')
    showToast(`Platba ${amount.toFixed(2)} € pre ${recipient} bola zapísaná.`)

    // PDF confirmation after successful DB write (overlay + upload)
    void generateAndDeliverReceipt({
      transactionId: txnId,
      createdAt: createdAtLabel,
      status: 'Štandardný platobný príkaz',
      transferType: 'external',
      fromAccountNumber: state.accountNumber || DEMO_ACCOUNT_NUMBER,
      recipientName: recipient,
      recipientAccountOrEmail: iban,
      amount: amount.toFixed(2),
      currency: 'EUR',
      variableSymbol: vs,
      constantSymbol: '0308',
      specificSymbol: '',
      note: note || 'Platba cez mobilnú verziu George',
      payerReference: '',
      dueDate: 'Dnes',
      repeatDays: '0',
      createTemplate: false,
      emailConfirmation: false,
      balanceBefore: (newTxn.balanceBefore ?? balanceBefore).toFixed(2),
      balanceAfter: (newTxn.balanceAfter ?? balanceAfter).toFixed(2),
    })
  }

  const uploadReceiptPdf = async (transactionId: string, blob: Blob) => {
    try {
      const form = new FormData()
      form.append('transactionId', transactionId)
      form.append('file', blob, `${transactionId}.pdf`)
      const res = await fetch('/api/receipts/upload', { method: 'POST', body: form })
      if (!res.ok) return
      const json = (await res.json()) as { success?: boolean; pdfUrl?: string }
      if (json.success && json.pdfUrl) {
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === transactionId ? { ...t, pdfUrl: json.pdfUrl } : t
          ),
        }))
        setSelectedTransaction((prev) =>
          prev?.id === transactionId ? { ...prev, pdfUrl: json.pdfUrl } : prev
        )
      }
    } catch (err) {
      console.warn('[dashboard2] receipt upload failed:', err)
    }
  }

  const generateAndDeliverReceipt = async (data: PaymentConfirmationPdfData) => {
    setPdfOverlayPhase('preparing')
    setPdfOverlayOpen(true)
    let closedEarly = false
    try {
      const result = await downloadPaymentConfirmationAsPdf(data)
      if (result.ok && result.blob) {
        setPdfOverlayPhase('done')
        void uploadReceiptPdf(data.transactionId, result.blob)
        closedEarly = true
        window.setTimeout(() => setPdfOverlayOpen(false), 600)
        return
      }
      if (result.usedHtmlFallback) {
        const forcedHtml =
          typeof window !== 'undefined' &&
          (window as Window & { __GEORGE_FORCE_HTML_RECEIPT__?: boolean })
            .__GEORGE_FORCE_HTML_RECEIPT__ === true
        // Keep the payment-success toast when e2e forces HTML; otherwise warn.
        if (!forcedHtml) {
          showToast('PDF sa nepodarilo vytvoriť — stiahnuté HTML.')
        }
      }
    } catch {
      try {
        await downloadPaymentConfirmationHtml(data)
        showToast('PDF sa nepodarilo vytvoriť — stiahnuté HTML.')
      } catch {
        showToast('Doklad sa nepodarilo stiahnuť.')
      }
    } finally {
      if (!closedEarly) {
        window.setTimeout(() => setPdfOverlayOpen(false), 400)
      }
    }
  }

  const buildTxnReceiptData = (txn: Transaction): PaymentConfirmationPdfData => {
    const abs = Math.abs(txn.amount)
    const parsed = parseMovementDescription(
      [txn.recipient, txn.note, txn.iban ? `IBAN: ${txn.iban}` : '', txn.vs ? `VS: ${txn.vs}` : '']
        .filter(Boolean)
        .join(' ')
    )
    return {
      transactionId: txn.id,
      createdAt: txn.createdAt
        ? new Date(txn.createdAt).toLocaleString('sk-SK')
        : new Date().toLocaleString('sk-SK'),
      status: 'Štandardný platobný príkaz',
      transferType: 'external',
      fromAccountNumber: state.accountNumber || DEMO_ACCOUNT_NUMBER,
      recipientName: parsed.recipient || txn.recipient,
      recipientAccountOrEmail:
        txn.iban || parsed.iban || 'SK00 0000 0000 0000 0000 0000',
      amount: abs.toFixed(2),
      currency: 'EUR',
      variableSymbol: txn.vs || parsed.vs || '',
      constantSymbol: '0308',
      specificSymbol: '',
      note: parsed.note || txn.note || 'Platba cez mobilnú verziu George',
      payerReference: '',
      dueDate: txn.date,
      repeatDays: '0',
      createTemplate: false,
      emailConfirmation: false,
      balanceBefore: (txn.balanceBefore ?? state.spaceBalance + abs).toFixed(2),
      balanceAfter: (txn.balanceAfter ?? state.spaceBalance).toFixed(2),
    }
  }

  const downloadTxnReceipt = (txn: Transaction) => {
    const isOutgoing =
      txn.type === 'outgoing' || txn.type === 'transfer' || txn.amount < 0
    if (!isOutgoing) {
      showToast('Doklad je dostupný len pre odchádzajúce platby.')
      return
    }
    void generateAndDeliverReceipt(buildTxnReceiptData(txn))
  }

  const openStoredPdf = (txn: Transaction) => {
    if (!txn.pdfUrl) return
    window.open(txn.pdfUrl, '_blank', 'noopener,noreferrer')
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    setIsToastVisible(true)

    if (toastTimeoutId) clearTimeout(toastTimeoutId)
    const id = setTimeout(() => {
      setIsToastVisible(false)
    }, 4000)
    setToastTimeoutId(id)
  }

  const handleKeypadPress = (digit: string) => {
    if (passcode.length >= 6) return
    const newPasscode = passcode + digit
    setPasscode(newPasscode)
    setLoginError(null)

    if (newPasscode.length === 6) {
      if (newPasscode === '666666') {
        setIsSimulatorLoggedIn(true)
        setPasscode('')
        // Bez oznamovacej správy – rovno prechod do dashboardu
      } else {
        setLoginError('Nesprávny PIN kód. Skúste to znova.')
        setPasscode('')
      }
    }
  }

  const handleKeypadBackspace = () => {
    if (passcode.length > 0) {
      setPasscode(passcode.slice(0, -1))
      setLoginError(null)
    }
  }

  const handleTextPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    try {
      const response = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: textPassword })
      })
      if (response.ok) {
        setIsSimulatorLoggedIn(true)
        setTextPassword('')
        setUsePasswordInput(false)
        setIsPasscodeScreen(false)
        showToast('Úspešne prihlásený cez heslo brány!')
      } else {
        setLoginError('Nesprávne heslo brány.')
      }
    } catch (err) {
      console.error(err)
      setLoginError('Chyba spojenia so serverom.')
    }
  }

  const toggleSearch = () => {
    if (!isSearchOpen) {
      setIsSearchOpen(true)
    } else {
      setIsSearchOpen(false)
      setSearchQuery('')
    }
  }

  // Close payment sheet on Escape key
  useEffect(() => {
    if (isPaymentSheetOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closePaymentSheet()
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPaymentSheetOpen])

  // Lock page scroll while viewport-fixed overlays are open (Android Chrome)
  useEffect(() => {
    const overlayOpen = isPaymentSheetOpen || !!selectedTransaction || !!modalType
    if (!overlayOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isPaymentSheetOpen, selectedTransaction, modalType])
  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => {
        const input = document.getElementById('search-input') as HTMLInputElement | null
        input?.focus()
      }, 100)

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsSearchOpen(false)
          setSearchQuery('')
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isSearchOpen])

  const showModal = (modalType: 'profile-modal' | 'moneyback-modal' | 'cards-modal') => {
    setModalType(modalType)
  }

  const hideModal = () => {
    setModalType(null)
  }

  const showQuickActions = () => {
    showToast('Zobrazené detailné informácie a nastavenia SPACE účtu.')
  }

  const toggleDemoDrawer = () => {
    setIsDemoDrawerOpen(prev => !prev)
  }

  const simulateIncomingCredit = (_amount: number) => {
    showToast(
      'Dobíjanie € je zakázané. Automatické obnovenie zostatku je možné až po 24 hodinách.'
    )
  }

  const simulateCashbackBonus = (amount: number) => {
    setState(prev => ({
      ...prev,
      moneybackBalance: prev.moneybackBalance + amount
    }))
    showToast(`George Moneyback: Pripísaná odmena +${amount.toFixed(2)} € za platbu kartou.`);
  }

  const simulateFundPurchase = (fundName: string) => {
    const sumStr = prompt(`Zadajte sumu v EUR, ktorú chcete investovať do fondu ${fundName}:`, "50")
    if (sumStr === null) return
    const sum = parseFloat(sumStr)

    if (isNaN(sum) || sum <= 0) {
      showToast('Neplatná suma pre investíciu.')
      return
    }

    if (sum > state.spaceBalance) {
      showToast('Nedostatok vlastných zdrojov na SPACE účte.')
      return
    }

    setState(prev => {
      const balanceBefore = prev.spaceBalance
      const balanceAfter = prev.spaceBalance - sum
      const txn: Transaction = {
        id: newTxnId('inv'),
        recipient: `Nákup podielov: ${fundName}`,
        amount: -sum,
        date: 'Dnes',
        createdAt: new Date().toISOString(),
        type: 'outgoing',
        status: 'Spracované',
        balanceBefore,
        balanceAfter,
        category: 'Investície',
        note: fundName,
      }
      return {
        ...prev,
        spaceBalance: balanceAfter,
        investBalance: prev.investBalance + sum,
        transactions: [txn, ...prev.transactions],
      }
    })

    // Okamžitý zápis odchádzajúcej investície do DB + live dashboard
    void fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: `Nákup podielov: ${fundName}`,
        amount: sum,
        type: 'outgoing',
        category: 'Investície',
        note: fundName,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.success !== false) {
          notifyPohybyLive({ type: 'payment', transactionId: data.transaction?.id })
        } else {
          console.error('Chyba ukladania investície do Supabase DB:', data.error || res.status)
        }
      })
      .catch((err) => console.error('Chyba ukladania investície do Supabase DB:', err))

    showToast(`Nákup podielov ${fundName} za ${sum.toFixed(2)} € úspešne spracovaný.`)
  }

  const activateCashback = (brandName: string) => {
    showToast(`Ponuka "${brandName}" bola aktivovaná. Pri ďalšej platbe kartou dostanete cashback!`)
  }

  const sendContactMessage = () => {
    if (!contactMessage.trim()) {
      showToast('Zadajte najprv text správy.')
      return
    }
    showToast('Vaša správa bola bezpečne odoslaná na klientsku podporu.')
    setContactMessage('')
  }

  const resetSandbox = () => {
    setState({
      spaceBalance: 0.53,
      moneybackBalance: 0.0,
      investBalance: 0.0,
      activeTab: 'prehlad',
      transactions: SEED_TRANSACTIONS,
      accountNumber: DEMO_ACCOUNT_NUMBER,
    })
    setSelectedTransaction(null)
    setTransactionFilter('all')
    try {
      localStorage.removeItem('george_pwa_state')
    } catch (e) {
      console.error('Chyba pri mazaní localStorage:', e)
    }
    setIsDemoDrawerOpen(false)
    showToast('Sandbox bol úspešne resetovaný.')
  }

  // Pomocné funkcie na zobrazenie súm
  const formatVal = (val: number) => {
    const balString = val.toFixed(2)
    const [main, cents] = balString.split('.')
    return {
      main: Number(main).toLocaleString('sk-SK'),
      cents: `,${cents}`,
      sub: val.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
  }

  const formatEurSk = (val: number) =>
    val.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const getTxnDirection = (txn: Transaction): TransactionFilter | 'all' => {
    if (txn.type === 'deposit') return 'deposit'
    if (txn.type === 'outgoing' || txn.amount < 0) return 'outgoing'
    if (txn.type === 'incoming' || txn.amount > 0) return 'incoming'
    return 'all'
  }

  const getTxnMeta = (txn: Transaction) => {
    const direction = getTxnDirection(txn)
    const isOutgoing = direction === 'outgoing'
    const isDeposit = direction === 'deposit'
    return {
      direction,
      label: isOutgoing ? 'Odchádzajúca' : isDeposit ? 'Dobitie' : 'Prichádzajúca',
      filterLabel: isOutgoing ? 'Odoslané' : isDeposit ? 'Dobitie' : 'Prijaté',
      amountClass: isOutgoing ? 'text-red-400' : 'text-emerald-400',
      signedAmount: `${isOutgoing ? '-' : '+'} ${formatEurSk(Math.abs(txn.amount))} €`,
    }
  }

  const filterItems: { value: TransactionFilter; label: string }[] = [
    { value: 'all', label: 'Všetko' },
    { value: 'incoming', label: 'Prijaté' },
    { value: 'outgoing', label: 'Odoslané' },
    { value: 'deposit', label: 'Dobitie' },
  ]

  const filteredHistory = state.transactions
    .filter((txn) => {
      if (transactionFilter === 'all') return true
      return getTxnDirection(txn) === transactionFilter
    })
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0
      return tb - ta
    })
    .slice(0, 20)

  const spaceBal = formatVal(state.spaceBalance)
  const moneybackBal = formatVal(state.moneybackBalance)
  const investBal = formatVal(state.investBalance)

  // Vyhľadávanie live search
  const query = searchQuery.toLowerCase().trim()
  const filteredSearchResults = query
    ? state.transactions.filter(t => t.recipient.toLowerCase().includes(query))
    : []

  if (!isSimulatorLoggedIn) {
    return (
      <div
        className={`w-full bg-[#030305] text-slate-100 flex flex-col relative overflow-x-hidden ${
          isPasscodeScreen ? 'min-h-dvh h-dvh overflow-hidden' : 'min-h-screen'
        }`}
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >

        {/* Desktop chrome — only ≥lg; hidden on PIN / mobile / PWA standalone */}
        {!isPasscodeScreen && (
          <>
            <div className="d2-desktop-chrome hidden lg:block">
              <DashboardHeader user={user} />
            </div>
            <div className="d2-desktop-chrome hidden lg:block w-full bg-[#0a0a10] border-b border-slate-900/40 px-6 py-3.5 text-[15px] font-bold text-white tracking-tight select-none">
              Domov
            </div>
          </>
        )}

        <div
          className={`d2-phone-center flex justify-center relative ${
            isPasscodeScreen
              ? 'min-h-dvh h-dvh p-0 items-stretch'
              : 'flex-1 p-0 items-stretch lg:items-center lg:p-6 xl:p-12'
          }`}
        >

          <style dangerouslySetInnerHTML={{ __html: `
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&display=swap');

            html, body {
              background-color: #030305 !important;
              overflow-x: hidden;
              font-family: 'DM Sans', system-ui, sans-serif;
            }
            .accent-glow {
              filter: blur(140px);
            }
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
            .no-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
            .welcome-card {
              background: #1c1e2a;
              border-radius: 18px;
            }
            .welcome-card:hover {
              background: #232536;
            }
            /* Prirodzený stĺpec 1:1 so screenshotom – bez mt-auto / translate */
            .welcome-screen {
              display: flex;
              flex-direction: column;
              min-height: 100%;
              padding-top: 28px;
              padding-bottom: 20px;
            }
            .welcome-hero {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              margin-bottom: 28px;
            }
            .welcome-cta {
              margin-bottom: 20px;
            }
            .welcome-forgot {
              margin-bottom: 28px;
            }
            .welcome-products {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .welcome-products-title {
              margin: 0 0 4px 2px;
              font-size: 15px;
              font-weight: 700;
              color: #fff;
              text-align: left;
              line-height: 1.3;
            }

            /* Face ID UI & Animations */
            .face-id-backdrop {
              position: absolute;
              inset: 0;
              background: rgba(3, 3, 5, 0.6);
              backdrop-filter: blur(16px);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              z-index: 200;
              animation: fadeIn 0.25s ease-out forwards;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }

            .face-id-box {
              width: 155px;
              height: 155px;
              background: rgba(22, 23, 35, 0.85);
              border: 1px solid rgba(255, 255, 255, 0.08);
              box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
              border-radius: 30px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 22px;
              position: relative;
              animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes scaleUp {
              from { transform: scale(0.85); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }

            .face-id-svg {
              stroke-linecap: round;
              stroke-linejoin: round;
              stroke-width: 4px;
              stroke: #fff;
              fill: none;
              display: block;
              transition: stroke 0.3s ease;
            }

            .face-id-svg.success {
              stroke: #10b981;
            }

            .face-id-label {
              font-size: 13px;
              font-weight: 600;
              color: rgba(255, 255, 255, 0.9);
              margin-top: 14px;
              text-align: center;
              letter-spacing: -0.01em;
            }

            /* Animations inside Face ID */
            .face-id-corner {
              transition: all 0.5s ease-in-out;
            }
            .face-id-corner.scanning {
              animation: cornerScan 1.2s ease-in-out infinite alternate;
            }
            @keyframes cornerScan {
              0% { stroke: #fff; }
              50% { stroke: #327bf5; }
              100% { stroke: #a78bfa; }
            }

            .face-id-element {
              transition: opacity 0.3s ease;
            }
            .face-id-element.hidden {
              opacity: 0;
            }

            .face-id-tick {
              stroke-dasharray: 50;
              stroke-dashoffset: 50;
              transition: stroke-dashoffset 0.4s ease-out;
              stroke: #10b981;
            }
            .face-id-tick.success {
              stroke-dashoffset: 0;
            }

            .face-id-scanner-ring {
              position: absolute;
              width: 72px;
              height: 72px;
              border-radius: 50%;
              border: 3px solid transparent;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.3s ease;
            }
            .face-id-scanner-ring.active {
              opacity: 0.8;
            }

            .face-id-scanner-ring-1 {
              border-top-color: #327bf5;
              border-bottom-color: #327bf5;
              animation: spinRing1 1.4s linear infinite;
            }
            .face-id-scanner-ring-2 {
              border-left-color: #a78bfa;
              border-right-color: #a78bfa;
              animation: spinRing2 1.4s linear infinite;
            }

            @keyframes spinRing1 {
              0% { transform: rotate(0deg) scale(0.9); }
              50% { transform: rotate(180deg) scale(1.1); }
              100% { transform: rotate(360deg) scale(0.9); }
            }
            @keyframes spinRing2 {
              0% { transform: rotate(360deg) scale(1.1); }
              50% { transform: rotate(180deg) scale(0.9); }
              100% { transform: rotate(0deg) scale(1.1); }
            }
          ` }} />

          <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-112.5 h-112.5 bg-purple-900/10 rounded-full accent-glow pointer-events-none z-0"></div>
          <div className="fixed bottom-1/4 left-1/3 w-87.5 h-87.5 bg-blue-900/10 rounded-full accent-glow pointer-events-none z-0"></div>

          {/* Shell: full-bleed on mobile/PWA; phone preview only ≥lg (not PIN) */}
          <div
            className={`d2-phone-shell w-full max-w-none bg-[#12131a] relative flex flex-col overflow-hidden z-10 ${
              isPasscodeScreen
                ? 'min-h-dvh h-dvh max-h-dvh'
                : 'h-dvh max-h-dvh min-h-0 lg:max-w-103 lg:h-223 lg:min-h-223 lg:max-h-223 lg:rounded-[44px] lg:ring-12 lg:ring-neutral-800/90 lg:shadow-[0_30px_80px_-10px_rgba(0,0,0,0.95)]'
            }`}
          >

            <div className="flex-1 min-h-0 bg-[#12131a] flex flex-col overflow-hidden relative w-full h-full">
              <div id="toast-welcome" className={`absolute top-12 left-1/2 -translate-x-1/2 bg-blue-600 border border-blue-400 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl transition-all duration-300 text-center w-[85%] z-100 ${isToastVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                {toastMessage}
              </div>

              <div
                className={`flex-1 min-h-0 px-5 flex flex-col ${
                  isPasscodeScreen ? 'h-full overflow-hidden' : 'overflow-y-auto no-scrollbar'
                }`}
              >
                {!isPasscodeScreen ? (
                  <div className="welcome-screen select-none">
                    {/* Hero: logo + nadpis + podnadpis */}
                    <div className="welcome-hero">
                      <div className="w-14 h-14 mb-4 flex items-center justify-center text-white">
                        <svg className="w-full h-full" viewBox="0 0 48 48" fill="none" aria-hidden>
                          <path
                            d="M24 8.5c-8.56 0-15.5 6.94-15.5 15.5S15.44 39.5 24 39.5c4.7 0 8.9-2.1 11.7-5.4"
                            stroke="currentColor"
                            strokeWidth="3.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M35.5 24V11.5"
                            stroke="currentColor"
                            strokeWidth="3.1"
                            strokeLinecap="round"
                          />
                          <path
                            d="M35.5 24c0 6.35-5.15 11.5-11.5 11.5S12.5 30.35 12.5 24 17.65 12.5 24 12.5c3.9 0 7.35 1.95 9.4 4.9"
                            stroke="currentColor"
                            strokeWidth="3.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <h2 className="text-[32px] font-extrabold text-white tracking-[-0.03em] leading-[1.1] mb-2">
                        Ahoj, som George
                      </h2>
                      <p className="text-[#b8bcc8] text-[14px] font-medium px-4 leading-snug">
                        Pomôžem vám so všetkým, čo sa týka peňazí.
                      </p>
                    </div>

                    {/* Prihlásiť sa */}
                    <div className="welcome-cta">
                      <button
                        onClick={() => {
                          // Len PIN obrazovka – Face ID spúšťa samostatne ikona na klávesnici
                          setIsPasscodeScreen(true)
                          setPasscode('')
                          setLoginError(null)
                          setUsePasswordInput(false)
                        }}
                        className="w-full bg-white hover:bg-slate-50 text-[#327bf5] font-bold py-3.5 px-6 rounded-full text-[16px] flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(0,0,0,0.28),0_2px_6px_rgba(50,123,245,0.12)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
                      >
                        Prihlásiť sa
                        <span className="text-[17px] font-normal leading-none tracking-wide opacity-90">→</span>
                      </button>
                    </div>

                    {/* Zabudnuté prihlasovacie údaje */}
                    <div
                      onClick={() => {
                        showToast('Zabudnuté údaje je možné nastaviť v Georgeovi pre PC.')
                      }}
                      className="welcome-card welcome-forgot border border-white/4 transition-all duration-200 px-4 py-3.5 cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <svg className="w-5.5 h-5.5 text-[#5b9cff] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <rect x="4.5" y="11" width="15" height="10" rx="2.5" />
                          <path d="M8 11V7.5a4 4 0 018 0V11" />
                        </svg>
                        <div className="min-w-0 text-left">
                          <h4 className="text-[14px] font-bold text-white leading-snug">Zabudnuté prihlasovacie údaje</h4>
                          <p className="text-[12px] text-[#9aa0af] mt-0.5 leading-snug">Nastavte si nové prihlasovacie meno a heslo.</p>
                        </div>
                      </div>
                      <span className="text-[#8b90a0] font-normal text-[20px] shrink-0 leading-none">›</span>
                    </div>

                    {/* Produktové kartičky – prirodzený tok pod Zabudnuté */}
                    <div className="welcome-products">
                      <h3 className="welcome-products-title">Chcem sa stať klientom</h3>

                      {/* Osobný účet */}
                      <div
                        onClick={() => {
                          showToast('Založenie účtu je k dispozícii v pobočkách SLSP.')
                        }}
                        className="welcome-card border border-white/4 transition-all duration-200 p-3.5 cursor-pointer flex items-center gap-3.5"
                      >
                        <div className="w-14 h-14 shrink-0 rounded-[14px] bg-white flex items-center justify-center shadow-sm relative overflow-hidden">
                          <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden>
                            <defs>
                              <linearGradient id="cardPurp" x1="8" y1="6" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#9b5de5" />
                                <stop offset="1" stopColor="#6b2db5" />
                              </linearGradient>
                              <linearGradient id="cardBlue" x1="12" y1="10" x2="34" y2="32" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#4d9fff" />
                                <stop offset="1" stopColor="#2563eb" />
                              </linearGradient>
                              <filter id="cardSh" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodOpacity="0.28" />
                              </filter>
                            </defs>
                            <g filter="url(#cardSh)">
                              <rect x="5" y="10" width="22" height="15" rx="2.2" fill="url(#cardPurp)" transform="rotate(-14 16 17.5)" />
                              <rect x="11" y="12" width="22" height="15" rx="2.2" fill="url(#cardBlue)" transform="rotate(10 22 19.5)" />
                              <rect x="13.5" y="15.5" width="5" height="3.2" rx="0.6" fill="#fbbf24" opacity="0.95" transform="rotate(10 16 17)" />
                              <rect x="20" y="22" width="9" height="1.4" rx="0.5" fill="white" opacity="0.35" transform="rotate(10 24.5 22.7)" />
                            </g>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-[15px] font-bold text-white">Osobný účet</h4>
                            <span className="text-white font-normal text-[15px]">→</span>
                          </div>
                          <p className="text-[12px] text-[#9aa0af] mt-0.5">Založte si bežný účet.</p>
                        </div>
                      </div>

                      {/* Podnikateľský účet */}
                      <div
                        onClick={() => {
                          showToast('Založenie firemného účtu je k dispozícii v pobočkách SLSP.')
                        }}
                        className="welcome-card border border-white/4 transition-all duration-200 p-3.5 cursor-pointer flex items-center gap-3.5"
                      >
                        <div className="w-14 h-14 shrink-0 rounded-[14px] bg-white flex items-center justify-center shadow-sm relative overflow-hidden">
                          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden>
                            <defs>
                              <linearGradient id="caseBody" x1="6" y1="12" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#c77a3a" />
                                <stop offset="1" stopColor="#8b4518" />
                              </linearGradient>
                              <linearGradient id="caseTop" x1="12" y1="6" x2="28" y2="14" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#d4924f" />
                                <stop offset="1" stopColor="#a05a22" />
                              </linearGradient>
                              <filter id="caseSh" x="-15%" y="-15%" width="130%" height="140%">
                                <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodOpacity="0.3" />
                              </filter>
                            </defs>
                            <g filter="url(#caseSh)">
                              <path d="M13 14h14c1 0 1.5.5 1.5 1.2V17H11.5v-1.8c0-.7.5-1.2 1.5-1.2z" fill="url(#caseTop)" />
                              <rect x="8" y="16.5" width="24" height="16" rx="2.5" fill="url(#caseBody)" />
                              <rect x="8" y="22" width="24" height="2" fill="#6b3410" opacity="0.45" />
                              <rect x="17.5" y="21.5" width="5" height="3.5" rx="0.8" fill="#e8c547" stroke="#b8860b" strokeWidth="0.5" />
                              <rect x="18.8" y="22.5" width="1.2" height="1.5" rx="0.3" fill="#8b6914" />
                            </g>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-[15px] font-bold text-white">Podnikateľský účet</h4>
                            <span className="text-white font-normal text-[15px]">→</span>
                          </div>
                          <p className="text-[12px] text-[#9aa0af] mt-0.5">Pre živnostníkov aj pre firmy.</p>
                        </div>
                      </div>

                      {/* Investovanie */}
                      <div
                        onClick={() => {
                          showToast('Pre investovanie sa najprv prihláste.')
                        }}
                        className="welcome-card border border-white/4 transition-all duration-200 p-3.5 cursor-pointer flex items-center gap-3.5"
                      >
                        <div className="w-14 h-14 shrink-0 rounded-[14px] bg-white flex items-center justify-center shadow-sm relative overflow-hidden">
                          <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden>
                            <defs>
                              <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                                <stop stopColor="#a5b4fc" />
                                <stop offset="1" stopColor="#6366f1" />
                              </linearGradient>
                              <linearGradient id="bar2" x1="0" y1="0" x2="0" y2="1">
                                <stop stopColor="#c4b5fd" />
                                <stop offset="1" stopColor="#7c3aed" />
                              </linearGradient>
                              <linearGradient id="bar3" x1="0" y1="0" x2="0" y2="1">
                                <stop stopColor="#ddd6fe" />
                                <stop offset="1" stopColor="#8b5cf6" />
                              </linearGradient>
                              <linearGradient id="linePink" x1="6" y1="28" x2="34" y2="10" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#f472b6" />
                                <stop offset="1" stopColor="#ec4899" />
                              </linearGradient>
                              <filter id="chartSh" x="-15%" y="-15%" width="130%" height="140%">
                                <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.22" />
                              </filter>
                            </defs>
                            <g filter="url(#chartSh)">
                              <rect x="8" y="22" width="5.5" height="10" rx="1.2" fill="url(#bar1)" />
                              <rect x="17" y="16" width="5.5" height="16" rx="1.2" fill="url(#bar2)" />
                              <rect x="26" y="11" width="5.5" height="21" rx="1.2" fill="url(#bar3)" />
                              <path d="M7 27 C14 20, 20 24, 26 15 S 34 9, 35 8" stroke="url(#linePink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                              <circle cx="35" cy="8" r="2" fill="#f472b6" />
                            </g>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-[15px] font-bold text-white">Investovanie</h4>
                            <span className="text-white font-normal text-[15px]">→</span>
                          </div>
                          <p className="text-[12px] text-[#9aa0af] mt-0.5">Nechajte vaše peniaze zarábať.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* PIN / George kľúč – always fill full viewport height */
                  <div
                    data-testid="pin-screen"
                    className="flex-1 min-h-dvh h-dvh max-h-dvh flex flex-col justify-between pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] box-border select-none"
                  >
                    <div className="flex flex-col items-center shrink-0">
                      <div className="flex justify-between items-center w-full mb-6">
                        <button
                          onClick={() => {
                            setIsPasscodeScreen(false)
                            setPasscode('')
                            setLoginError(null)
                            setUsePasswordInput(false)
                          }}
                          className="text-slate-400 hover:text-white transition-colors min-h-11 min-w-11 flex items-center justify-center"
                          aria-label="Späť"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">George kľúč</h3>
                        <div className="w-11"></div>
                      </div>

                      <div className="w-10 h-10 mb-4 text-[#5b9cff]">
                        <svg className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <rect x="4.5" y="11" width="15" height="10" rx="2.5" />
                          <path d="M8 11V7.5a4 4 0 018 0V11" />
                        </svg>
                      </div>

                      <h3 className="text-base font-bold text-white text-center leading-snug">
                        {usePasswordInput ? 'Zadajte heslo' : 'Zadajte bezpečnostný PIN'}
                      </h3>

                      {loginError && (
                        <p className="text-[11px] text-red-400 font-bold mt-3 bg-red-950/20 border border-red-500/20 rounded-xl px-3 py-1.5 text-center animate-pulse">
                          {loginError}
                        </p>
                      )}

                      {!usePasswordInput ? (
                        <div className="flex justify-center space-x-3 my-8">
                          {[0, 1, 2, 3, 4, 5].map((idx) => {
                            const isFilled = passcode.length > idx
                            return (
                              <div
                                key={idx}
                                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${isFilled ? 'bg-[#327bf5] border-[#327bf5] scale-110' : 'border-slate-700'}`}
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <form onSubmit={handleTextPasswordSubmit} className="w-full max-w-xs mt-6 mb-4 flex flex-col gap-2.5">
                          <input
                            type="password"
                            placeholder="Napr. Heslo123###"
                            value={textPassword}
                            onChange={(e) => setTextPassword(e.target.value)}
                            required
                            autoFocus
                            className="w-full h-11 px-4 bg-[#171821] border border-slate-800 focus:border-[#327bf5] rounded-xl text-center text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 transition-all"
                          />
                          <button
                            type="submit"
                            className="w-full h-10 bg-[#327bf5] hover:bg-blue-600 text-white font-bold rounded-xl text-[11px] transition-all active:scale-95"
                          >
                            Potvrdiť heslo
                          </button>
                        </form>
                      )}
                    </div>

                    {!usePasswordInput ? (
                      <div className="w-full max-w-65 mx-auto flex flex-col gap-3 select-none shrink-0 pb-2">
                        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                            <button
                              key={num}
                              onClick={() => handleKeypadPress(num)}
                              className="w-14 h-14 mx-auto rounded-full bg-[#171821] hover:bg-[#1d1e2b] text-lg font-bold flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                            >
                              {num}
                            </button>
                          ))}

                          <button
                            onClick={triggerBiometrics}
                            className="w-14 h-14 mx-auto rounded-full bg-[#171821] hover:bg-[#1d1e2b]/80 flex items-center justify-center text-[#327bf5] active:scale-90 transition-all cursor-pointer shadow-sm"
                            aria-label="Prihlásiť sa tvárou"
                          >
                            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                              <path d="M8 8h.01M16 8h.01M9 13h6M10 17h4" />
                            </svg>
                          </button>

                          <button
                            onClick={() => handleKeypadPress('0')}
                            className="w-14 h-14 mx-auto rounded-full bg-[#171821] hover:bg-[#1d1e2b] text-lg font-bold flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                          >
                            0
                          </button>

                          <button
                            onClick={handleKeypadBackspace}
                            className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 active:scale-90 transition-all cursor-pointer"
                          >
                            <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.41-6.41A2 2 0 0110.83 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.17a2 2 0 01-1.42-.59L3 12z" />
                            </svg>
                          </button>
                        </div>

                        {/* Použiť heslo text link below the keypad */}
                        <div className="text-center mt-5">
                          <button
                            onClick={() => {
                              setUsePasswordInput(true)
                              setPasscode('')
                              setLoginError(null)
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-350 transition-colors uppercase tracking-wider min-h-11"
                          >
                            Použiť heslo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setUsePasswordInput(false)
                          setTextPassword('')
                          setLoginError(null)
                        }}
                        className="text-[11px] font-bold text-[#327bf5] hover:text-blue-400 text-center transition-colors mb-4 cursor-pointer min-h-11"
                      >
                        Návrat na zadanie PIN kódu
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 35: iOS home indicator — hidden on full-height PIN so screen stays 100vh */}
              {!isPasscodeScreen && (
              <div className="shrink-0 flex justify-center pb-2 pt-1 pointer-events-none" aria-hidden>
                <div className="w-30 h-1 rounded-full bg-white/35" />
              </div>
              )}

              {/* BIOMETRIA TVÁROU (FACE ID) OVERLAY */}
              {isBiometricsActive && (
                <div className="face-id-backdrop">
                  <div className="face-id-box">
                    <div className={`face-id-scanner-ring face-id-scanner-ring-1 ${!biometricsSuccess ? 'active' : ''}`} />
                    <div className={`face-id-scanner-ring face-id-scanner-ring-2 ${!biometricsSuccess ? 'active' : ''}`} />

                    <div className="relative w-19.5 h-19.5 rounded-full overflow-hidden bg-black/60 border border-slate-700/50 flex items-center justify-center">
                      {/* Video vždy v DOM keď beží biometria (ref musí existovať pred detekciou) */}
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        autoPlay
                        className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${
                          isCameraActive && !biometricsSuccess ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                      />

                      {/* Face ID ikona – kým nie je kamera / po úspechu */}
                      {(!isCameraActive || biometricsSuccess) && (
                        <svg className={`w-12 h-12 face-id-svg relative z-10 ${biometricsSuccess ? 'success' : ''}`} viewBox="0 0 80 80" fill="none">
                          <defs>
                            <path id="fid-corner" d="M2,18 L2,12 Q2,2 12,2 L18,2" strokeWidth="4.5" />
                          </defs>
                          <g className={`face-id-corner ${!biometricsSuccess ? 'scanning' : ''}`}>
                            <use href="#fid-corner" />
                            <use href="#fid-corner" transform="matrix(0 1 -1 0 80 0)" />
                            <use href="#fid-corner" transform="matrix(0 -1 1 0 0 80)" />
                            <use href="#fid-corner" transform="matrix(-1 0 0 -1 80 80)" />
                          </g>
                          <g className={`face-id-element ${biometricsSuccess ? 'hidden' : ''}`} strokeWidth="4" stroke="currentColor">
                            <line x1="26" y1="28" x2="26" y2="34" strokeLinecap="round" />
                            <line x1="54" y1="28" x2="54" y2="34" strokeLinecap="round" />
                            <path d="M40,28 L40,43 M40,43 L36,43" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M30,50 Q40,58 50,50" strokeLinecap="round" />
                          </g>
                          <path
                            className={`face-id-tick ${biometricsSuccess ? 'success' : ''}`}
                            d="M24,42 L35,53 L56,29"
                            strokeWidth="5.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}

                      {isCameraActive && !biometricsSuccess && (
                        <div className="absolute inset-0 pointer-events-none z-10">
                          <div className="w-full h-0.5 bg-[#327bf5] shadow-[0_0_8px_#327bf5] absolute top-0 face-id-scanner-line" />
                        </div>
                      )}
                    </div>

                    <div className="face-id-label">
                      {!faceapiLoaded ? 'Spúšťam...' : !modelsLoaded ? 'Modely...' : !isCameraActive ? 'Kamera...' : biometricsSuccess ? 'Rozpoznané' : 'Hľadám tvár...'}
                    </div>
                  </div>

                  <button
                    onClick={cancelBiometrics}
                    className="absolute bottom-16 text-slate-400 hover:text-white font-semibold text-sm transition-colors cursor-pointer select-none"
                  >
                    Zrušiť
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-dvh h-dvh w-full bg-[#030305] text-slate-100 flex flex-col font-sans relative overflow-hidden">

      {/* Desktop chrome — only ≥lg; hidden on mobile / PWA standalone */}
      <div className="d2-desktop-chrome hidden lg:block shrink-0">
        <DashboardHeader user={user} />
      </div>
      <div className="d2-desktop-chrome hidden lg:block shrink-0 w-full bg-[#0a0a10] border-b border-slate-900/40 px-6 py-3.5 text-[15px] font-bold text-white tracking-tight select-none">
        Domov
      </div>

      {/* Centrovací kontajner: full-bleed mobile; phone preview ≥lg */}
      <div className="d2-phone-center flex-1 min-h-0 flex items-stretch justify-center p-0 lg:items-center lg:p-6 xl:p-12 relative">

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        html, body {
          background-color: #030305 !important;
          overflow-x: hidden;
          font-family: 'Inter', sans-serif;
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .george-card {
          position: relative;
          background: linear-gradient(180deg, #151621 0%, #111219 100%);
          border: 1px solid rgba(255, 255, 255, 0.015);
          box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
        }

        .george-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.2px;
          pointer-events: none;
        }

        .glow-purple::before {
          background: linear-gradient(90deg, rgba(161, 63, 231, 0.22) 0%, rgba(50, 123, 245, 0.22) 100%);
          border-top-left-radius: inherit;
          border-top-right-radius: inherit;
        }
        .glow-teal::before {
          background: linear-gradient(90deg, rgba(50, 123, 245, 0.22) 0%, rgba(44, 166, 190, 0.22) 100%);
          border-top-left-radius: inherit;
          border-top-right-radius: inherit;
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.3; }
        }
        .accent-glow {
          filter: blur(60px);
          animation: pulse-glow 7s infinite ease-in-out;
        }
      ` }} />

      <title>George - Slovenská sporiteľňa</title>

      {/* Ambientný glow efekt na pozadí pre prémiový dojem v prehliadači */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-112.5 h-112.5 bg-purple-900/10 rounded-full accent-glow pointer-events-none z-0"></div>
      <div className="fixed bottom-1/4 left-1/3 w-87.5 h-87.5 bg-blue-900/10 rounded-full accent-glow pointer-events-none z-0"></div>

      {/* HLAVNÝ SHELL: full-bleed mobile; desktop phone frame ≥lg */}
      <div className="d2-phone-shell w-full max-w-none bg-[#0a0a10] h-dvh max-h-dvh min-h-0 lg:max-w-103 lg:h-223 lg:min-h-223 lg:max-h-223 lg:rounded-[44px] lg:ring-12 lg:ring-neutral-800/90 lg:shadow-[0_30px_80px_-10px_rgba(0,0,0,0.95)] relative flex flex-col justify-between overflow-hidden z-10">

        {/* INNER SCROLLABLE WORKSPACE */}
        <div
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col justify-between transition-all duration-300"
          style={{ paddingBottom: isDemoDrawerOpen ? '250px' : 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
        >

          {/*==================================================
              ZÁLOŽKA 1: PREHĽAD (VÝCHODISKOVÁ)
              ==================================================*/}
          <div id="content-prehlad" className={`tab-content ${state.activeTab === 'prehlad' ? 'block' : 'hidden'}`}>
            {/* HEADER S PRESNÝM ODTIEŇOM MODREJ #327bf5 */}
            <header className="sticky top-0 bg-[#0a0a10]/95 backdrop-blur-md z-30 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 flex items-center justify-between">
              <div className="w-8"></div>
              <h1 className="text-[20px] font-bold tracking-tight text-white select-none">Prehľad</h1>

              <div className="flex items-center space-x-4.5">
                {/* Lupa */}
                <button onClick={toggleSearch} className="text-[#327bf5] hover:text-blue-400 transition-all p-0.5 active:scale-90" aria-label="Vyhľadať">
                  <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7.5" />
                    <path strokeLinecap="round" d="M21 21l-4.8-4.8" />
                  </svg>
                </button>
                {/* Karty */}
                <button onClick={() => showModal('cards-modal')} className="text-[#327bf5] hover:text-blue-400 transition-all p-0.5 active:scale-90" aria-label="Karty">
                  <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
                    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
                    <path d="M2.5 10.5h19" strokeLinecap="round" />
                    <rect x="5.5" y="13.5" width="3" height="1.8" rx="0.5" />
                  </svg>
                </button>
                {/* Profil */}
                <button onClick={() => showModal('profile-modal')} className="text-[#327bf5] hover:text-blue-400 transition-all p-0.5 active:scale-90" aria-label="Profil">
                  <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="4.2" />
                    <path d="M4.5 19.5c0-3.3 3.3-6 7.5-6s7.5 2.7 7.5 6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </header>

            {/* SEKCIA: VAŠE PRODUKTY */}
            <main className="px-5 mt-1">
              <h2 className="text-[15px] font-semibold text-slate-200 mb-3 px-1 select-none">Vaše produkty</h2>

              <div className="space-y-3.5">

                {/* KARTA 1: SPACE účet */}
                <div className="george-card glow-purple rounded-[18px] p-5 shadow-lg relative overflow-hidden transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-200">SPACE účet</h3>

                      {/* Suma s reálnou trávovo-zelenou farbou George #179f42 */}
                      <div className="text-[32px] font-extrabold text-[#179f42] mt-1.5 tracking-tight flex items-start select-none leading-none">
                        <span id="space-balance-main">{spaceBal.main}</span>
                        <span id="space-balance-cents" className="text-lg font-bold" style={{ verticalAlign: 'super', lineHeight: 1.1, marginTop: '-1px' }}>{spaceBal.cents}</span>
                        <span className="text-3xl font-normal ml-1.5">€</span>
                      </div>
                      <p className="text-xs text-[#7f8596] mt-2 select-none"><span id="space-balance-sub">{spaceBal.sub}</span> € vlastné zdroje</p>
                    </div>

                    {/* Profilová fotka s retro hrejivým filtrom ako na snímke */}
                    <div className="w-11 h-11 rounded-full border border-indigo-500/25 overflow-hidden shadow-inner cursor-pointer hover:scale-105 active:scale-95 transition-transform" onClick={() => showModal('profile-modal')}>
                      <img src={user.image || "/images/default-avatar.svg"} alt="Profil" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Akčné prvky (Nová platba, tri bodky s obrysom) */}
                  <div className="flex items-center justify-between mt-5 pt-3.5 border-t border-slate-800/60">
                    <button onClick={openPaymentSheet} className="text-[#327bf5] hover:text-blue-300 font-bold text-[14px] transition-colors active:scale-95 focus:outline-none">
                      Nová platba
                    </button>
                    <button onClick={showQuickActions} className="w-8 h-8 rounded-full border border-[#327bf5]/45 hover:bg-[#327bf5]/10 flex items-center justify-center text-[#327bf5] transition-all focus:outline-none active:scale-90" aria-label="Možnosti">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="12" r={2} />
                        <circle cx="12" cy="12" r={2} />
                        <circle cx="19" cy="12" r={2} />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* KARTA 2: Moneyback */}
                <div onClick={() => showModal('moneyback-modal')} className="george-card glow-purple rounded-[18px] p-5 shadow-lg relative overflow-hidden transition-all duration-300 hover:border-slate-800/80 cursor-pointer active:scale-[0.99]">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-200">Moneyback</h3>
                      <div className="text-[13px] text-[#7f8596] mt-2 flex items-baseline select-none font-medium">
                        <span id="moneyback-balance-main" className="font-semibold text-[#7f8596]">{moneybackBal.main}</span>
                        <span id="moneyback-balance-cents" className="text-xs font-semibold text-[#7f8596]">{moneybackBal.cents}</span>
                        <span className="ml-0.5">€ na vyplatenie</span>
                      </div>
                    </div>
                    {/* Slivkovo-fialové kruhové pozadie s fialovou nákupnou taškou */}
                    <div className="w-10 h-10 rounded-full bg-[#1d112d] border border-purple-500/10 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5" fill="none" stroke="#a13fe7" strokeWidth="2.2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* KARTA 3: Poistenie osobných vecí a karty */}
                <div className="george-card glow-teal rounded-[18px] p-5 shadow-lg relative overflow-hidden transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-200 leading-tight">Poistenie osobných vecí a karty</h3>
                      <div className="text-[28px] font-extrabold text-white mt-2.5 tracking-tight flex items-start select-none leading-none">
                        <span>4</span>
                        <span className="text-base font-bold" style={{ verticalAlign: 'super', lineHeight: 1.1, marginTop: '-1px' }}>,99</span>
                        <span className="text-2xl font-normal ml-1.5">€</span>
                      </div>
                      <p className="text-xs text-[#7f8596] mt-1.5">mesačne</p>
                    </div>
                    {/* Vektorová replika loga pre cestovné poistenie (Travel logo z predlohy) */}
                    <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center p-1 shadow-md select-none">
                      <svg className="w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="45" fill="#1da1c0" />
                        {/* Airplane silhouette */}
                        <path d="M50 22 L54 42 L78 48 L54 52 L50 72 L46 52 L22 48 L46 42 Z" fill="#ffffff" />
                        {/* Curved dashed lines for flight path */}
                        <path d="M25 70 C 40 85, 60 85, 75 70" stroke="#ffffff" strokeWidth="3.5" strokeDasharray="6,4" strokeLinecap="round" />
                        <path d="M15 50 C 15 30, 85 30, 85 50" stroke="#ffffff" strokeWidth="2.5" opacity="0.4" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* KARTA 4: Investície */}
                <div className="george-card glow-purple rounded-[18px] p-5 shadow-lg relative overflow-hidden transition-all duration-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-200">Investície</h3>
                      <div className="text-[28px] font-extrabold text-white mt-2 tracking-tight flex items-start select-none leading-none">
                        <span id="invest-balance-main">{investBal.main}</span>
                        <span id="invest-balance-cents" className="text-base font-bold" style={{ verticalAlign: 'super', lineHeight: 1.1, marginTop: '-1px' }}>{investBal.cents}</span>
                        <span className="text-2xl font-normal ml-1.5">€</span>
                      </div>
                    </div>
                    {/* Slivkovo-fialové pozadie s ikonou vlnitého grafu */}
                    <div className="w-10 h-10 rounded-full bg-[#1d112d] border border-purple-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="#a13fe7" strokeWidth="2.3" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5 L7.5 10.5 L12 14.5 L16.5 7 L21 11" />
                        <circle cx="16.5" cy="7" r="1.5" fill="#a13fe7" />
                      </svg>
                    </div>
                  </div>

                  {/* Odkaz presne pod sumou s deliacou čiarou */}
                  <div className="mt-4 pt-3.5 border-t border-white/5">
                    <button onClick={() => switchTab('invest')} className="text-[#327bf5] hover:text-blue-300 font-bold text-[14px] transition-colors active:scale-95 focus:outline-none">
                      Vyhľadať a kúpiť
                    </button>
                  </div>
                </div>

                {/* KARTA 5: Poistenie zneužitia platieb */}
                <div className="george-card glow-purple rounded-[18px] p-5 shadow-lg relative overflow-hidden transition-all duration-300 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-200 leading-tight">Poistenie zneužitia platieb</h3>
                      <p className="text-[13px] text-[#7f8596] mt-2 select-none">súčasť balíka Premium</p>
                    </div>
                    {/* Slivkové pozadie s ikonou platobnej karty a štítom */}
                    <div className="w-10 h-10 rounded-full bg-[#1d112d] border border-purple-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="#a13fe7" strokeWidth="2.2" viewBox="0 0 24 24">
                        <rect x="2" y="5" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 10h20" strokeLinecap="round" />
                        <rect x="5" y="13" width="3" height="2" rx="0.5" fill="#a13fe7" />
                        <path d="M15 13.5 C 15 12, 17 11.5, 17 11.5 C 17 11.5, 19 12, 19 13.5 C 19 15.5, 17 17, 17 17 C 17 17, 15 15.5, 15 13.5 Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>

              </div>

              {/* HISTÓRIA / PREHĽAD PREVODOV */}
              <section
                id="payment-history"
                className="mt-6 mb-6 george-card glow-purple rounded-2xl overflow-hidden border border-slate-800/40 shadow-lg shadow-black/20"
              >
                <div className="p-4 border-b border-slate-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">História</p>
                      <h2 className="text-base font-bold text-white mt-1">Prehľad prevodov</h2>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Limit 24 h:{' '}
                        <span className="font-semibold text-slate-200">
                          {(
                            DAILY_PAYMENT_LIMIT_EUR -
                            getTodayOutgoingUsed(state.transactions)
                          ).toFixed(2)}{' '}
                          / {DAILY_PAYMENT_LIMIT_EUR.toFixed(0)} €
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400 font-semibold">Aktuálny zostatok</p>
                      <p className="text-sm font-black text-[#179f42] mt-0.5">
                        € {formatEurSk(state.spaceBalance)}
                      </p>
                      <a
                        href="/pohyby"
                        className="mt-1 inline-block text-[11px] font-semibold text-[#327bf5] hover:underline"
                      >
                        Live dashboard
                      </a>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {filterItems.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setTransactionFilter(item.value)}
                        className={`h-9 min-w-18 shrink-0 rounded-full border px-3 text-xs font-bold transition-all duration-200 ${
                          transactionFilter === item.value
                            ? 'border-[#327bf5] bg-[#327bf5] text-white'
                            : 'border-slate-800 bg-[#1b1b26] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>



                {filteredHistory.length > 0 ? (
                  <div className="divide-y divide-slate-800/40" data-testid="payment-history-list">
                    {filteredHistory.map((txn) => {
                      const meta = getTxnMeta(txn)
                      return (
                        <button
                          key={txn.id}
                          type="button"
                          data-testid={`txn-row-${txn.id}`}
                          onClick={() => setSelectedTransaction(txn)}
                          className="w-full px-4 py-3.5 text-left transition-all duration-200 hover:bg-[#1b1b26]/55 focus-visible:outline-none focus-visible:bg-[#1b1b26]/55"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-[#1b1b26] ${meta.amountClass}`}
                            >
                              {meta.direction === 'outgoing' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M10 7h7v7" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M14 17H7v-7" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-bold text-white">{txn.recipient}</p>
                                <span className="shrink-0 rounded-full bg-[#1b1b26] border border-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                                  {meta.filterLabel}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                                {txn.date}
                                {txn.note ? ` | ${txn.note}` : ''}
                              </p>
                              {txn.balanceAfter !== undefined && (
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                  Zostatok po: € {formatEurSk(txn.balanceAfter)}
                                </p>
                              )}
                            </div>
                            <p className={`shrink-0 text-sm font-black ${meta.amountClass}`}>
                              {meta.signedAmount}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-bold text-white">Žiadne transakcie v tomto filtri</p>
                    <p className="mt-1 text-xs text-slate-400">Po ďalšom prevode sa objavia priamo tu.</p>
                  </div>
                )}
              </section>

              {/* DOKLADY SANDBOX — persistent PDF receipts */}
              <section
                id="receipts-sandbox"
                data-testid="receipts-sandbox"
                className="mt-4 mb-8 george-card rounded-2xl overflow-hidden border border-slate-800/40 shadow-lg shadow-black/20"
              >
                <div className="p-4 border-b border-slate-800/40">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sandbox</p>
                  <h2 className="text-base font-bold text-white mt-1">Doklady</h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Uložené PDF potvrdenia k odchádzajúcim platbám.
                  </p>
                </div>
                {(() => {
                  const receiptTxns = state.transactions.filter(
                    (t) =>
                      t.type === 'outgoing' ||
                      t.type === 'transfer' ||
                      t.amount < 0
                  )
                  if (receiptTxns.length === 0) {
                    return (
                      <div className="px-4 py-8 text-center">
                        <p className="text-sm font-bold text-white">Zatiaľ žiadne uložené doklady</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Po odoslaní platby sa tu objavia.
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div className="divide-y divide-slate-800/40" data-testid="receipts-sandbox-list">
                      {receiptTxns.slice(0, 20).map((txn) => {
                        const meta = getTxnMeta(txn)
                        return (
                          <div
                            key={`receipt-${txn.id}`}
                            data-testid="receipt-sandbox-row"
                            className="flex flex-col gap-2 px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">{txn.recipient}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {txn.date} · {meta.signedAmount}
                                </p>
                              </div>
                              {txn.pdfUrl ? (
                                <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-400">
                                  PDF
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full border border-slate-700 bg-[#1b1b26] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
                                  —
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {txn.pdfUrl ? (
                                <button
                                  type="button"
                                  data-testid="receipt-open-pdf"
                                  onClick={() => openStoredPdf(txn)}
                                  className="flex-1 min-h-10 rounded-xl bg-[#327bf5] text-white text-xs font-bold"
                                >
                                  Otvoriť PDF
                                </button>
                              ) : null}
                              <button
                                type="button"
                                data-testid="receipt-regenerate"
                                onClick={() => downloadTxnReceipt(txn)}
                                className="flex-1 min-h-10 rounded-xl border border-slate-700 bg-[#1b1b26] text-slate-200 text-xs font-bold"
                              >
                                {txn.pdfUrl ? 'Regenerovať' : 'Vygenerovať'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </section>
            </main>
          </div>

          {/*==================================================
              ZÁLOŽKA 2: INVEST (PORTFÓLIO A TRHY)
              ==================================================*/}
          <div id="content-invest" className={`tab-content ${state.activeTab === 'invest' ? 'block' : 'hidden'}`}>
            <header className="px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">Investície</h1>
              <button onClick={() => showModal('cards-modal')} className="bg-[#327bf5]/20 text-[#327bf5] border border-[#327bf5]/25 px-3 py-1 rounded-full text-xs font-semibold hover:bg-[#327bf5]/30 active:scale-95 transition-all">
                + Kúpiť
              </button>
            </header>

            <main className="px-5 space-y-4">
              <div className="george-card glow-purple rounded-[18px] p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Hodnota majetku</p>
                <div className="text-3xl font-extrabold text-white mt-1 flex items-start">
                  <span id="portfolio-val-main">{investBal.main}</span>
                  <span id="portfolio-val-cents" className="text-lg font-semibold mt-0.5">{investBal.cents}</span>
                  <span className="text-2xl font-light ml-1">€</span>
                </div>
                <div className="flex items-center space-x-1.5 mt-2 text-emerald-400 text-xs font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>+0,00 % (dnes)</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 px-1">Populárne fondy</h3>
                <div className="space-y-3">
                  <div onClick={() => simulateFundPurchase('Global Blue Chip')} className="flex justify-between items-center bg-[#151621] p-3.5 rounded-xl border border-slate-800/40 hover:border-slate-700/50 cursor-pointer active:scale-[0.98] transition-all">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">Global Blue Chip Fund</h4>
                      <p className="text-[11px] text-slate-400">Akciový • Veľké svetové firmy</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-400 block">+14,82%</span>
                      <span className="text-[10px] text-slate-500">za 1 rok</span>
                    </div>
                  </div>
                  <div onClick={() => simulateFundPurchase('Zelený Svet')} className="flex justify-between items-center bg-[#151621] p-3.5 rounded-xl border border-slate-800/40 hover:border-slate-700/50 cursor-pointer active:scale-[0.98] transition-all">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">Zelený Svet ESG</h4>
                      <p className="text-[11px] text-slate-400">Udržateľné technológie</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-400 block">+9,41%</span>
                      <span className="text-[10px] text-slate-500">za 1 rok</span>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>

          {/*==================================================
              ZÁLOŽKA 3: OBJAVUJTE
              ==================================================*/}
          <div id="content-objavujte" className={`tab-content ${state.activeTab === 'objavujte' ? 'block' : 'hidden'}`}>
            <header className="px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
              <h1 className="text-xl font-bold text-white">Objavujte</h1>
              <p className="text-xs text-slate-400">Služby, výhody a produkty na dosah</p>
            </header>

            <main className="px-5 space-y-4">
              <div className="bg-linear-to-r from-purple-900/40 to-blue-900/40 p-5 rounded-2xl border border-purple-500/20 relative overflow-hidden">
                <div className="z-10 relative">
                  <span className="bg-purple-600 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">Exkluzívne</span>
                  <h3 className="text-base font-bold text-white mt-2 leading-snug">Vyskúšajte program Premium</h3>
                  <p className="text-xs text-slate-300 mt-1">Cestovné poistenie pre celú rodinu a výhodnejšie úročenie.</p>
                  <button onClick={() => showToast('Žiadosť o Premium bola odoslaná na posúdenie.')} className="bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl mt-4 hover:bg-slate-200 active:scale-95 transition-all">
                    Chcem zistiť viac
                  </button>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-300 px-1">Top zľavy v Moneyback</h3>
              <div className="grid grid-cols-2 gap-3">
                <div onClick={() => activateCashback('Shell (3%)')} className="bg-[#151621] p-4 rounded-xl border border-slate-800/40 hover:border-slate-700/50 cursor-pointer text-center transition-all active:scale-95">
                  <div className="w-10 h-10 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-2 font-bold text-sm">S</div>
                  <h4 className="text-xs font-semibold text-slate-200">Shell SK</h4>
                  <p className="text-[10px] text-[#10b981] font-semibold mt-1">Cashback 3%</p>
                </div>
                <div onClick={() => activateCashback('Tesco (5%)')} className="bg-[#151621] p-4 rounded-xl border border-slate-800/40 hover:border-slate-700/50 cursor-pointer text-center transition-all active:scale-95">
                  <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 font-bold text-sm">T</div>
                  <h4 className="text-xs font-semibold text-slate-200">Tesco Slovensko</h4>
                  <p className="text-[10px] text-[#10b981] font-semibold mt-1">Cashback 5%</p>
                </div>
              </div>
            </main>
          </div>

          {/*==================================================
              ZÁLOŽKA 4: KONTAKTY
              ==================================================*/}
          <div id="content-kontakty" className={`tab-content ${state.activeTab === 'kontakty' ? 'block' : 'hidden'}`}>
            <header className="px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
              <h1 className="text-xl font-bold text-white">Kontakty</h1>
              <p className="text-xs text-slate-400">Sme tu pre vás 24/7</p>
            </header>

            <main className="px-5 space-y-4">
              <div className="bg-[#151621] rounded-[18px] p-5 border border-slate-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Klientska linka George</h3>
                  <p className="text-xs text-slate-400 mt-1">Slovensko: {slovenskoNumber}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Zo zahraničia: {zahranicieNumber}</p>
                </div>
                <a href={`tel:${slovenskoNumber.replace(/\s+/g, '')}`} className="w-10 h-10 rounded-full bg-[#327bf5]/20 text-[#327bf5] flex items-center justify-center hover:bg-[#327bf5]/30 active:scale-90 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
              </div>

              <div className="bg-[#151621] rounded-[18px] p-5 border border-slate-800/40">
                <h3 className="text-sm font-bold text-slate-200 mb-3">Napíšte nám správu</h3>
                <textarea
                  id="contact-message"
                  placeholder="Ako vám dnes môžeme pomôcť?"
                  rows={3}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  className="w-full bg-[#0a0a10] border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
                <button onClick={sendContactMessage} className="w-full bg-[#327bf5] hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-xs mt-3 transition-colors active:scale-95">
                  Odoslať správu cez George kľúč
                </button>
              </div>
            </main>
          </div>

        </div>

        {/*==================================================
            SPODNÁ NAVIGAČNÁ LIŠTA (AKTÍVNA KAPSULA 1:1)
            ==================================================*/}
        <nav
          className="d2-tab-nav absolute left-0 right-0 bg-[#0a0a10]/98 backdrop-blur-md border-t border-slate-900/40 px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex justify-around items-center z-40 lg:rounded-b-[42px] transition-all duration-300"
          style={{ bottom: isDemoDrawerOpen ? '172px' : '0px' }}
        >

          {/* Záložka 1: Prehľad s obrysom #327bf5 */}
          <button
            onClick={() => switchTab('prehlad')}
            id="tab-prehlad"
            className="flex flex-col items-center focus:outline-none transition-all duration-300"
          >
            <div
              id="icon-container-prehlad"
              className={state.activeTab === 'prehlad' ? 'bg-[#0c244f] px-5 py-1.5 rounded-full text-[#327bf5] flex items-center justify-center transition-all duration-200' : 'px-5 py-1.5 flex items-center justify-center text-[#7f8596] hover:text-slate-200 transition-all duration-200'}
            >
              {/* Dokonalé SVG logo George malé "g" */}
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <circle cx="12" cy="10" r="4" />
                <path d="M16 10v6a4 4 0 01-4 4h-1a3 3 0 01-3-3" strokeLinecap="round" />
              </svg>
            </div>
            <span
              id="text-prehlad"
              className={state.activeTab === 'prehlad' ? 'text-[11px] font-bold text-[#327bf5] mt-1' : 'text-[11px] font-medium text-[#7f8596] mt-1'}
            >
              Prehľad
            </span>
          </button>

          {/* Záložka 2: Invest */}
          <button
            onClick={() => switchTab('invest')}
            id="tab-invest"
            className="flex flex-col items-center focus:outline-none transition-all duration-300"
          >
            <div
              id="icon-container-invest"
              className={state.activeTab === 'invest' ? 'bg-[#0c244f] px-5 py-1.5 rounded-full text-[#327bf5] flex items-center justify-center transition-all duration-200' : 'px-5 py-1.5 flex items-center justify-center text-[#7f8596] hover:text-slate-200 transition-all duration-200'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span
              id="text-invest"
              className={state.activeTab === 'invest' ? 'text-[11px] font-bold text-[#327bf5] mt-1' : 'text-[11px] font-medium text-[#7f8596] mt-1'}
            >
              Invest
            </span>
          </button>

          {/* Záložka 3: Objavujte */}
          <button
            onClick={() => switchTab('objavujte')}
            id="tab-objavujte"
            className="flex flex-col items-center focus:outline-none transition-all duration-300"
          >
            <div
              id="icon-container-objavujte"
              className={state.activeTab === 'objavujte' ? 'bg-[#0c244f] px-5 py-1.5 rounded-full text-[#327bf5] flex items-center justify-center transition-all duration-200' : 'px-5 py-1.5 flex items-center justify-center text-[#7f8596] hover:text-slate-200 transition-all duration-200'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <span
              id="text-objavujte"
              className={state.activeTab === 'objavujte' ? 'text-[11px] font-bold text-[#327bf5] mt-1' : 'text-[11px] font-medium text-[#7f8596] mt-1'}
            >
              Objavujte
            </span>
          </button>

          {/* Záložka 4: Kontakty */}
          <button
            onClick={() => switchTab('kontakty')}
            id="tab-kontakty"
            className="flex flex-col items-center focus:outline-none transition-all duration-300"
          >
            <div
              id="icon-container-kontakty"
              className={state.activeTab === 'kontakty' ? 'bg-[#0c244f] px-5 py-1.5 rounded-full text-[#327bf5] flex items-center justify-center transition-all duration-200' : 'px-5 py-1.5 flex items-center justify-center text-[#7f8596] hover:text-slate-200 transition-all duration-200'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span
              id="text-kontakty"
              className={state.activeTab === 'kontakty' ? 'text-[11px] font-bold text-[#327bf5] mt-1' : 'text-[11px] font-medium text-[#7f8596] mt-1'}
            >
              Kontakty
            </span>
          </button>

        </nav>

        {/* payment-sheet is portaled to document.body — see end of component */}

        {/* DETAIL TRANSAKCIE — fixed to viewport */}
        <div
          id="txn-detail-modal"
          className={`fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md transition-all duration-300 p-0 lg:absolute lg:items-center lg:p-5 ${
            selectedTransaction ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setSelectedTransaction(null)}
        >
          {selectedTransaction && (
            <div
              className="bg-[#12131b] w-full lg:rounded-3xl rounded-t-3xl border border-slate-800 shadow-2xl relative max-h-[min(85dvh,85%)] overflow-y-auto no-scrollbar pb-[max(0px,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
              data-testid="txn-detail-modal"
            >
              <div className="sticky top-0 bg-[#12131b]/95 backdrop-blur-md flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 border-b border-slate-800/40">
                <h3 className="text-base font-bold text-white">Detail prevodu</h3>
                <button
                  type="button"
                  onClick={() => setSelectedTransaction(null)}
                  className="min-h-11 min-w-11 rounded-full p-2 text-slate-400 hover:text-white hover:bg-[#1b1b26]"
                  aria-label="Zavrieť detail"
                >
                  <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2 p-4 text-sm">
                {(
                  [
                    ['Suma', getTxnMeta(selectedTransaction).signedAmount],
                    ['Typ', getTxnMeta(selectedTransaction).label],
                    ['Stav', selectedTransaction.status || 'Spracované'],
                    ['Dátum', selectedTransaction.date],
                    ['Poznámka', selectedTransaction.note || '—'],
                    ['Kategória', selectedTransaction.category || '—'],
                    ['IBAN', selectedTransaction.iban || '—'],
                    ['VS', selectedTransaction.vs || '—'],
                    [
                      'Zostatok pred',
                      selectedTransaction.balanceBefore !== undefined
                        ? `€ ${formatEurSk(selectedTransaction.balanceBefore)}`
                        : 'nezaznamenané',
                    ],
                    [
                      'Zostatok po',
                      selectedTransaction.balanceAfter !== undefined
                        ? `€ ${formatEurSk(selectedTransaction.balanceAfter)}`
                        : 'nezaznamenané',
                    ],
                    ['ID transakcie', selectedTransaction.id],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 rounded-xl bg-[#1b1b26] border border-slate-800/40 px-3 py-2.5"
                  >
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">
                      {label}
                    </span>
                    <span className="break-all text-right text-xs font-semibold text-white">{value}</span>
                  </div>
                ))}
              </div>

              {(selectedTransaction.type === 'outgoing' ||
                selectedTransaction.type === 'transfer' ||
                selectedTransaction.amount < 0) && (
                <div className="border-t border-slate-800/40 p-4 flex flex-col gap-2">
                  {selectedTransaction.pdfUrl ? (
                    <button
                      type="button"
                      data-testid="txn-open-stored-pdf"
                      onClick={() => openStoredPdf(selectedTransaction)}
                      className="w-full min-h-11 rounded-xl bg-[#327bf5] hover:bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/30"
                    >
                      Otvoriť uložené PDF
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="txn-download-receipt"
                    onClick={() => downloadTxnReceipt(selectedTransaction)}
                    className={`w-full min-h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                      selectedTransaction.pdfUrl
                        ? 'border border-slate-700 bg-[#1b1b26] text-slate-200 hover:bg-slate-800'
                        : 'bg-[#327bf5] hover:bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    }`}
                  >
                    {selectedTransaction.pdfUrl ? 'Regenerovať doklad' : 'Stiahnuť doklad'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* POP-UP MODAL PRE DETAILY — fixed to viewport */}
        <div id="general-modal" className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-300 p-5 lg:absolute ${modalType ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-[#12131b] w-full max-h-[min(90dvh,100%)] overflow-y-auto no-scrollbar rounded-3xl border border-slate-800 p-5 shadow-2xl relative">
            <button
              type="button"
              onClick={hideModal}
              className="absolute top-3.5 right-3.5 w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all touch-manipulation cursor-pointer select-none"
              aria-label="Zavrieť modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div id="modal-content" className="text-center pt-3">
              {modalType === 'profile-modal' && (
                <>
                  <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 overflow-hidden mx-auto mb-3">
                    <img src={user.image || "/images/default-avatar.svg"} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <h4 className="text-base font-bold text-white">{user.name || 'Peter Novotný'}</h4>
                  <p className="text-xs text-[#7f8596] mt-1">SPACE účet</p>
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-2.5 text-left text-xs">
                    <div className="flex justify-between"><span className="text-[#7f8596]">George Kľúč:</span> <span className="text-emerald-400 font-bold">Aktívny</span></div>
                    <div className="flex justify-between"><span className="text-[#7f8596]">Verzia aplikácie:</span> <span className="text-slate-200">2026.4.2 (Prototyp)</span></div>
                    <div className="flex justify-between"><span className="text-[#7f8596]">Posledné prihlásenie:</span> <span className="text-slate-200">Dnes o 02:14</span></div>
                  </div>
                </>
              )}
              {modalType === 'moneyback-modal' && (
                <>
                  <div className="w-12 h-12 rounded-full bg-[#1d112d] border border-purple-500/15 flex items-center justify-center text-purple-400 mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="#a13fe7" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-white">George Moneyback program</h4>
                  <p className="text-xs text-[#7f8596] mt-1">Zbierajte odmeny za nákupy kartou, ktoré vám vrátime priamo na váš účet.</p>
                </>
              )}
              {modalType === 'cards-modal' && (
                <>
                  <div className="w-12 h-12 rounded-full bg-blue-950/40 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="#3b86f7" strokeWidth="2.1" viewBox="0 0 24 24">
                      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
                      <path d="M2.5 10.5h19" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-white">Vaše platobné karty</h4>
                  <p className="text-xs text-[#7f8596] mt-1">Správa fyzických a virtuálnych kariet.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SEARCH BACKDROP OVERLAY */}
        <div
          onClick={() => {
            setIsSearchOpen(false)
            setSearchQuery('')
          }}
          className={`fixed inset-0 z-40 bg-black/75 backdrop-blur-xs transition-all duration-300 lg:absolute ${
            isSearchOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* HĽADANIE MODAL DRAWER */}
        <div
          id="search-drawer"
          className={`fixed inset-x-0 top-0 z-50 bg-[#0a0a10] border-b border-slate-800/80 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl transition-all duration-300 flex flex-col justify-between lg:absolute ${
            isSearchOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div>
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="text-sm font-bold text-slate-300">Rýchle vyhľadávanie</h3>
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen(false)
                  setSearchQuery('')
                }}
                className="text-xs font-semibold text-slate-200 bg-slate-800/90 hover:bg-slate-700 hover:text-white px-3.5 py-1.5 rounded-lg active:scale-95 transition-all touch-manipulation cursor-pointer select-none"
              >
                Zrušiť
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                id="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zadajte meno príjemcu, IBAN alebo produkt..."
                className="w-full bg-[#1b1b26] border border-slate-700/60 rounded-xl pl-10 pr-9 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-1 rounded-full text-xs font-bold"
                  aria-label="Vymazať vy vyhľadávanie"
                >
                  ✕
                </button>
              )}
            </div>
            <div id="search-results" className="mt-4 space-y-2 max-h-48 overflow-y-auto no-scrollbar">
              {!query ? (
                <p className="text-[11px] text-[#7f8596] italic">Začnite písať pre vyhľadanie v histórii...</p>
              ) : filteredSearchResults.length === 0 ? (
                <p className="text-[11px] text-[#7f8596] italic">Nenašli sa žiadne zhodné transakcie ani funkcie.</p>
              ) : (
                filteredSearchResults.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => {
                      setSelectedTransaction(t)
                      setIsSearchOpen(false)
                      setSearchQuery('')
                    }}
                    className="w-full flex justify-between items-center bg-[#1b1b26]/50 p-2.5 rounded-xl border border-slate-800/40 text-left active:bg-slate-800/80 transition-colors"
                  >
                    <div>
                      <p className="text-[11px] font-semibold text-white">{t.recipient}</p>
                      <p className="text-[9px] text-[#7f8596]">{t.date}{t.note ? ` • ${t.note}` : ''}</p>
                    </div>
                    <span className={`text-xs font-bold ${t.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {t.amount < 0 ? '' : '+'}{t.amount.toFixed(2)} €
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* TOAST NOTIFIKÁCIA */}
        <PdfGenerateOverlay open={pdfOverlayOpen} phase={pdfOverlayPhase} />

        <div id="toast" className={`fixed top-[max(2.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 bg-blue-600 border border-blue-400 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl transition-all duration-300 text-center w-[85%] max-w-103 z-100 lg:absolute lg:top-10 ${isToastVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          {toastMessage}
        </div>

        {/* SKRYTÝ DEMO PANEL (SANDBOX) */}
        <div id="demo-drawer" className={`absolute inset-x-0 bottom-0 bg-[#1e2030] border-t border-blue-500/30 p-4 rounded-t-2xl z-40 transition-all duration-300 ${isDemoDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Demo / Sandbox Ovládací panel</h4>
            <button onClick={toggleDemoDrawer} className="text-xs text-slate-400 hover:text-white">Zavrieť</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled
              onClick={() => simulateIncomingCredit(50.00)}
              className="bg-slate-700/40 text-slate-500 border border-slate-600/40 font-semibold py-2 rounded-xl text-[11px] cursor-not-allowed opacity-60"
              title="Dobíjanie zakázané — auto obnovenie max 1× / 24 h"
            >
              + Prijať 50,00 € (zakázané)
            </button>
            <button
              type="button"
              disabled
              onClick={() => simulateIncomingCredit(1000.00)}
              className="bg-slate-700/40 text-slate-500 border border-slate-600/40 font-semibold py-2 rounded-xl text-[11px] cursor-not-allowed opacity-60"
              title="Dobíjanie zakázané — auto obnovenie max 1× / 24 h"
            >
              + Prijať 1 000,00 € (zakázané)
            </button>
            <p className="col-span-2 text-[10px] text-amber-200/90 leading-snug rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              Pravidlo: manuálne dobíjanie € je vypnuté. Automatické obnovenie zostatku na 6 660 € je možné najviac 1× za 24 hodín.
            </p>
            <button onClick={() => simulateCashbackBonus(5.50)} className="bg-purple-600/20 text-purple-300 border border-purple-500/30 font-semibold py-2 rounded-xl text-[11px] hover:bg-purple-600/30 active:scale-95 transition-all">
              Zarobiť Cashback 5,50 €
            </button>
            <button onClick={resetSandbox} className="bg-red-600/20 text-red-400 border border-red-500/30 font-semibold py-2 rounded-xl text-[11px] hover:bg-red-600/30 active:scale-95 transition-all">
              Resetovať stavy
            </button>
          </div>
        </div>

        {/* Tlačidlo pre Sandbox */}
        <button
          onClick={toggleDemoDrawer}
          className="absolute right-4 bg-slate-800/80 hover:bg-blue-600 text-slate-300 hover:text-white p-2.5 rounded-full shadow-lg z-30 transition-all border border-slate-700 active:scale-90 duration-300"
          style={{ bottom: isDemoDrawerOpen ? '252px' : '96px' }}
          title="Otvoriť Sandbox"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

      </div>
    </div>
  </div>

    {portalReady
      ? createPortal(
          <div
            id="payment-sheet"
            data-testid="payment-sheet"
            className={`fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm transition-opacity duration-300 ${
              isPaymentSheetOpen
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={!isPaymentSheetOpen}
          >
            <div
              onClick={closePaymentSheet}
              className="absolute inset-0 z-0 cursor-pointer"
              aria-hidden
            />

            <div
              data-testid="payment-sheet-panel"
              className={`absolute inset-0 z-10 flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-[#12131b] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out ${
                isPaymentSheetOpen ? 'translate-y-0' : 'translate-y-full'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="py-2.5 w-full flex justify-center cursor-pointer touch-manipulation shrink-0 px-6"
                onClick={closePaymentSheet}
              >
                <div className="w-12 h-1.5 bg-slate-600/80 hover:bg-slate-500 rounded-full" />
              </div>

              <div className="flex justify-between items-center mb-4 pt-1 shrink-0 px-6">
                <h3 className="text-lg font-bold text-white">Nová platba</h3>
                <button
                  type="button"
                  onClick={closePaymentSheet}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all touch-manipulation cursor-pointer select-none -mr-2"
                  aria-label="Zavrieť novú platbu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* QR Code Scanner Button */}
              <div className="px-6 mb-3">
                <button
                  type="button"
                  onClick={openQrScanner}
                  className="w-full bg-transparent border border-slate-800 rounded-xl text-[13px] text-[#327bf5] font-bold flex items-center justify-center gap-2 hover:bg-[#1b1b26]/50 transition-colors focus:outline-none py-2.5"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h2v2h-2zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z" />
                  </svg>
                  Skenovať QR kód
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto no-scrollbar flex-1 min-h-0 px-6">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                    Meno príjemcu
                  </label>
                  <input
                    id="pay-recipient"
                    type="text"
                    placeholder="napr. Ján Kováč"
                    value={payRecipient}
                    onChange={(e) => setPayRecipient(e.target.value)}
                    className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                    IBAN príjemcu
                  </label>
                  <input
                    id="pay-iban"
                    type="text"
                    placeholder="SK80 0900 0000 0012 3456 7890"
                    value={payIban}
                    onChange={(e) => setPayIban(e.target.value)}
                    className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                      Suma v EUR (€)
                    </label>
                    <input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                      Variabilný symbol
                    </label>
                    <input
                      id="pay-vs"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="Nepovinné"
                      value={payVs}
                      onChange={(e) => setPayVs(e.target.value.replace(/\D/g, '').substring(0, 10))}
                      className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                    Poznámka (max. 140 znakov)
                  </label>
                  <input
                    id="pay-note"
                    type="text"
                    maxLength={140}
                    placeholder="Nepovinné"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value.substring(0, 140))}
                    className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <button
                  type="button"
                  onClick={executeMockPayment}
                  className="w-full bg-[#327bf5] hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl text-sm mt-3.5 mb-2 transition-all active:scale-95 shadow-lg shadow-blue-900/30 touch-manipulation cursor-pointer"
                >
                  Autorizovať cez George kľúč
                </button>
              </div>

              {/* QR Code Scanner Modal */}
              {showQrScanner && scannedDraft === null && (
                <PaymentQrScanner
                  onScanSuccess={handleScanSuccess}
                  onError={handleScanError}
                  onClose={handleScannerClose}
                  title="Skenovať platobný QR kód"
                  description="Namierte kameru na platobný QR kód (EPC/SEPA, PAY by square)"
                  showImageUpload={true}
                />
              )}

              {/* QR Code Preview Modal */}
              {showQrPreview && scannedDraft && (
                <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="w-full max-w-md bg-[#12131b] rounded-2xl p-6 relative overflow-y-auto max-h-[90vh]">
                    <QrPaymentPreview
                      draft={scannedDraft}
                      options={paymentOptions}
                      onOptionSelect={handleOptionSelect}
                      onSaveContact={handleSaveContactFromPreview}
                      onSendMoney={handleSendMoneyFromPreview}
                      onClose={() => setShowQrPreview(false)}
                      onScanAgain={handleScanAgain}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null}
    </>
  )
}
