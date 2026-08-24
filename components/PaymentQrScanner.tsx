'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Result, NotFoundException } from '@zxing/library';
import { PaymentDraft, PaymentOption, QrDecodingResult } from '@/types/payment';
import { decodeQrCode, QrDecodingError } from '@/utils/qr';

/**
 * Props for the PaymentQrScanner component
 */
export interface PaymentQrScannerProps {
  /**
   * Called when a QR code is successfully scanned and decoded
   */
  onScanSuccess: (draft: PaymentDraft) => void;

  /**
   * Called when an error occurs during scanning
   */
  onError: (error: Error) => void;

  /**
   * Called when the scanner is closed
   */
  onClose: () => void;

  /**
   * Optional: Called when multiple payment options are available
   * If not provided, the first option will be used automatically
   */
  onMultipleOptions?: (options: PaymentOption[]) => void;

  /**
   * Title to display in the scanner modal
   */
  title?: string;

  /**
   * Description to display in the scanner modal
   */
  description?: string;

  /**
   * Whether to show the image upload fallback option
   * @default true
   */
  showImageUpload?: boolean;

  /**
   * Maximum image file size in bytes
   * @default 5 * 1024 * 1024 (5MB)
   */
  maxImageSize?: number;

  /**
   * Allowed image MIME types
   * @default ['image/jpeg', 'image/png', 'image/webp']
   */
  allowedImageTypes?: string[];
}

/**
 * PaymentQrScanner Component
 *
 * A component that allows users to scan QR codes using their device camera
 * or upload an image containing a QR code.
 */
export function PaymentQrScanner({
  onScanSuccess,
  onError,
  onClose,
  onMultipleOptions,
  title = 'Skenovať platobný QR kód',
  description = 'Namierte kameru na platobný QR kód (QR Platba / SPAYD, EPC/SEPA, PAY by square)',
  showImageUpload = true,
  maxImageSize = 5 * 1024 * 1024, // 5MB
  allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'],
}: PaymentQrScannerProps) {
  const [state, setState] = useState<'idle' | 'scanning' | 'processing' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  /**
   * Stop camera tracks, decoder, and reset video element
   */
  const stopCameraResources = useCallback(() => {
    if (scannerControlsRef.current) {
      try {
        scannerControlsRef.current.stop();
      } catch (err) {
        console.warn('[PaymentQrScanner] Error stopping scanner controls:', err);
      }
      scannerControlsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.warn('[PaymentQrScanner] Error stopping track:', err);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }

    codeReaderRef.current = null;
  }, []);

  /**
   * Full cleanup of camera and state
   */
  const cleanup = useCallback(() => {
    stopCameraResources();
    setState('idle');
    setErrorMessage(null);
  }, [stopCameraResources]);

  /**
   * Handle a single payment draft
   */
  const handleSingleDraft = useCallback(
    (draft: PaymentDraft) => {
      setState('success');
      onScanSuccess(draft);
    },
    [onScanSuccess]
  );

  /**
   * Handle a successful QR code scan string
   */
  const handleScanResult = useCallback(
    async (qrData: string) => {
      stopCameraResources();
      setState('processing');
      setErrorMessage(null);

      try {
        const result: QrDecodingResult = await decodeQrCode(qrData);

        if (!result.success || result.drafts.length === 0) {
          throw new QrDecodingError(
            result.error || 'Nepodarilo sa dekódovať QR kód',
            result.format ? 'UNSUPPORTED_QR_TYPE' : 'INVALID_QR_FORMAT',
            qrData
          );
        }

        if (result.drafts.length > 1 && onMultipleOptions) {
          const options: PaymentOption[] = result.drafts.map((draft, index) => ({
            id: `option-${index}`,
            label: draft.recipientName || draft.iban || `Možnosť ${index + 1}`,
            draft,
          }));
          onMultipleOptions(options);
        } else {
          handleSingleDraft(result.drafts[0]);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setErrorMessage(error.message);
        setState('error');
        onError(error);
      }
    },
    [stopCameraResources, onMultipleOptions, handleSingleDraft, onError]
  );

  /**
   * Initialize camera stream (Step A: get stream and transition to scanning state)
   */
  const initCamera = useCallback(async () => {
    stopCameraResources();
    setErrorMessage(null);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsCameraAvailable(false);
        setHasCameraPermission(false);
        const err = new Error('Kamera nie je podporovaná v tomto prehliadači.');
        setErrorMessage(err.message);
        setState('error');
        onError(err);
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (envErr) {
        console.warn('[PaymentQrScanner] Ideal environment camera unavailable, attempting fallback:', envErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      setHasCameraPermission(true);
      setIsCameraAvailable(true);
      setState('scanning');
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setHasCameraPermission(false);
        setErrorMessage('Prístup ku kamere bol zamietnutý. Povoľte prístup v nastaveniach prehliadača.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setIsCameraAvailable(false);
        setErrorMessage('Na tomto zariadení sa nenašla žiadna kamera.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setErrorMessage('Kamera je už používaná inou aplikáciou.');
      } else {
        setErrorMessage(`Chyba prístupu ku kamere: ${error.message || 'Neznáma chyba'}`);
      }

      setHasCameraPermission(false);
      setState('error');
      onError(error);
    }
  }, [stopCameraResources, onError]);

  /**
   * Step B: Attach stream to mounted video element and start ZXing scanner
   */
  useEffect(() => {
    if (state !== 'scanning' || !streamRef.current || !videoRef.current) {
      return;
    }

    let isCancelled = false;
    const video = videoRef.current;
    const stream = streamRef.current;

    const setupAndScan = async () => {
      try {
        video.srcObject = stream;

        // Ensure video is ready to play and has dimensions
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              cleanupListeners();
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                resolve();
              } else {
                reject(new Error('Kamera neposkytuje žiadny obraz (rozmery videa sú 0x0).'));
              }
            }, 4000);

            const onReady = () => {
              cleanupListeners();
              resolve();
            };

            const onVideoError = () => {
              cleanupListeners();
              reject(new Error('Chyba pri inicializácii obrazu kamery.'));
            };

            const cleanupListeners = () => {
              clearTimeout(timeout);
              video.removeEventListener('loadedmetadata', onReady);
              video.removeEventListener('canplay', onReady);
              video.removeEventListener('error', onVideoError);
            };

            video.addEventListener('loadedmetadata', onReady);
            video.addEventListener('canplay', onReady);
            video.addEventListener('error', onVideoError);
          });
        }

        if (isCancelled) return;

        await video.play();

        if (isCancelled) return;

        // Verification of video properties
        const isMediaStream = video.srcObject instanceof MediaStream;
        const hasDimensions = video.videoWidth > 0 && video.videoHeight > 0;
        const isReady = video.readyState >= 2;

        if (!isMediaStream || !hasDimensions || !isReady) {
          throw new Error(
            `Kamera neodovzdáva platný obraz (readyState: ${video.readyState}, ${video.videoWidth}x${video.videoHeight}).`
          );
        }

        const codeReader = new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        const controls: IScannerControls = codeReader.scan(
          video,
          (result: Result | undefined, error: unknown) => {
            if (isCancelled) return;
            if (result) {
              handleScanResult(result.getText());
            }
            if (error && !(error instanceof NotFoundException)) {
              // Ignore background scanning frames without QR
            }
          }
        );

        if (isCancelled) {
          controls.stop();
        } else {
          scannerControlsRef.current = controls;
        }
      } catch (err) {
        if (isCancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[PaymentQrScanner] Video play/scan error:', error);
        setErrorMessage(error.message || 'Nepodarilo sa spustiť obraz kamery.');
        setState('error');
        onError(error);
      }
    };

    setupAndScan();

    return () => {
      isCancelled = true;
      if (scannerControlsRef.current) {
        try {
          scannerControlsRef.current.stop();
        } catch {
          // ignore
        }
        scannerControlsRef.current = null;
      }
      codeReaderRef.current = null;
    };
  }, [state, handleScanResult, onError]);

  /**
   * Handle image file upload for QR scanning
   */
  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!allowedImageTypes.includes(file.type)) {
        const err = new Error(`Nepodporovaný typ súboru. Nahrajte prosím: ${allowedImageTypes.join(', ')}`);
        setErrorMessage(err.message);
        setState('error');
        onError(err);
        return;
      }

      if (file.size > maxImageSize) {
        const err = new Error(`Súbor je príliš veľký. Maximálna povolená veľkosť: ${maxImageSize / (1024 * 1024)}MB`);
        setErrorMessage(err.message);
        setState('error');
        onError(err);
        return;
      }

      setState('processing');
      setErrorMessage(null);

      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Nepodarilo sa načítať obrázok zo súboru.'));
        });

        const codeReader = new BrowserMultiFormatReader();
        const result = await codeReader.decodeFromImageElement(img);

        await handleScanResult(result.getText());
      } catch (err) {
        const error = err as Error;
        const isNotFound =
          error instanceof NotFoundException ||
          error.name === 'NotFoundException' ||
          error.message?.includes('No MultiFormat Readers') ||
          error.message?.includes('No barcode') ||
          error.message?.includes('not found');

        const message = isNotFound
          ? 'V nahranom obrázku sa nenašiel žiadny platný QR kód.'
          : `Nepodarilo sa načítať QR kód: ${error.message || 'Neznáma chyba'}`;

        setErrorMessage(message);
        setState('error');
        onError(new Error(message));
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [allowedImageTypes, maxImageSize, handleScanResult, onError]
  );

  const triggerFileUpload = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleRetry = useCallback(() => {
    cleanup();
    setErrorMessage(null);
    setState('idle');
    setHasCameraPermission(null);
  }, [cleanup]);

  const handleClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  // Clean up resources when unmounting
  useEffect(() => {
    return () => {
      stopCameraResources();
    };
  }, [stopCameraResources]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Zavrieť skener"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="p-5">
          {state === 'idle' && (
            <div className="text-center py-2">
              <div className="mb-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.8" />
                    <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.8" />
                    <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.8" />
                    <path d="M14 14h2v2h-2zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z" strokeWidth="1.8" />
                  </svg>
                </div>
              </div>

              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Ako chcete načítať platobný QR kód?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Vaše fotografie ani kamera sa nepoužívajú bez vášho výberu.
              </p>

              {hasCameraPermission === false && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-left">
                  <p className="text-xs text-yellow-500 font-medium">
                    Kamera nie je povolená. QR kód môžete stále načítať z fotografie.
                  </p>
                </div>
              )}

              {isCameraAvailable === false && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
                  <p className="text-xs text-red-400 font-medium">
                    Na tomto zariadení sa nenašla žiadna dostupná kamera.
                  </p>
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      sessionStorage.setItem('qrPreferredSource', 'camera');
                    } catch {}
                    initCamera();
                  }}
                  disabled={hasCameraPermission === false || isCameraAvailable === false}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <circle cx="12" cy="13" r="4" strokeWidth={1.8} />
                  </svg>
                  Skenovať kamerou
                </button>

                {showImageUpload && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('qrPreferredSource', 'photo');
                      } catch {}
                      triggerFileUpload();
                    }}
                    className="w-full py-3 px-4 bg-[#1b1b26] hover:bg-[#252533] border border-slate-800 text-slate-200 font-medium rounded-xl transition-all flex items-center justify-center gap-2.5"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Vybrať z Fotiek
                  </button>
                )}
              </div>

              {/* Privacy-first explicit single image input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedImageTypes.join(',')}
                onChange={handleImageUpload}
                className="hidden"
                capture="environment"
              />
            </div>
          )}

          {state === 'scanning' && (
            <div className="relative">
              {/* Camera Preview */}
              <div className="relative w-full h-64 md:h-72 bg-black rounded-xl overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onError={() => setErrorMessage('Chyba kamery pri prehrávaní obrazu.')}
                />

                {/* Scanner Overlay UI */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-48 h-48 sm:w-56 sm:h-56 border-2 border-blue-400/60 rounded-xl overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br" />
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_#3b82f6] animate-scan-line" />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Namierte kameru priamo na QR kód
                </p>
                {showImageUpload && (
                  <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="text-xs text-[#327bf5] hover:underline font-medium"
                  >
                    Vybrať z Fotiek
                  </button>
                )}
              </div>
            </div>
          )}

          {state === 'processing' && (
            <div className="text-center py-10">
              <div className="animate-spin h-10 w-10 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Spracovávam QR kód...</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 font-semibold mb-4">{errorMessage}</p>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Skúsiť kameru znova
                </button>

                {showImageUpload && (
                  <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="w-full py-2.5 px-4 bg-[#1b1b26] hover:bg-[#252533] border border-slate-800 text-slate-200 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    Vybrať z Fotiek
                  </button>
                )}
              </div>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-green-600 dark:text-green-400 font-semibold">QR kód úspešne načítaný!</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes scan-line {
          0% {
            top: 0;
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
        .animate-scan-line {
          animation: scan-line 2.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default PaymentQrScanner;
