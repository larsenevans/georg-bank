'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
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
 * PaymentQRScanner Component
 * 
 * A component that allows users to scan QR codes using their device camera
 * or upload an image containing a QR code.
 * 
 * Features:
 * - Camera access with user permission
 * - Image upload fallback
 * - Multiple payment option handling
 * - Error handling and user feedback
 * - Automatic stream cleanup
 */
export function PaymentQrScanner({
  onScanSuccess,
  onError,
  onClose,
  onMultipleOptions,
  title = 'Scan QR Code',
  description = 'Point your camera at a payment QR code to scan it',
  showImageUpload = true,
  maxImageSize = 5 * 1024 * 1024, // 5MB
  allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'],
}: PaymentQrScannerProps) {
  const [state, setState] = useState<'idle' | 'scanning' | 'processing' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState<boolean>(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scannerControlsRef = useRef<any>(null);

  /**
   * Cleanup camera stream and code reader
   */
  const cleanup = useCallback(() => {
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop scanner controls
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Cleanup code reader
    codeReaderRef.current = null;

    setState('idle');
    setErrorMessage(null);
    setPaymentOptions([]);
  }, []);

  /**
   * Initialize camera stream
   */
  const initCamera = useCallback(async () => {
    cleanup();
    
    try {
      // Check if camera API is available
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !window.MediaStreamTrack) {
        setIsCameraAvailable(false);
        setHasCameraPermission(false);
        return;
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer rear camera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;
      setHasCameraPermission(true);
      setIsCameraAvailable(true);
      setState('scanning');

      // Initialize code reader
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        startScanning(codeReader);
      }
    } catch (err) {
      const error = err as Error;
      
      // Check specific error types
      if (error.name === 'NotAllowedError') {
        setHasCameraPermission(false);
        setErrorMessage('Camera access was denied. Please allow camera access to scan QR codes.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setIsCameraAvailable(false);
        setErrorMessage('No camera found on this device.');
      } else if (error.name === 'NotReadableError') {
        setErrorMessage('Camera is already in use by another application.');
      } else {
        setErrorMessage('Failed to access camera. Please try again.');
      }
      
      setHasCameraPermission(false);
      setState('error');
    }
  }, [cleanup]);

  /**
   * Start scanning for QR codes using continuous scan
   */
  const startScanning = useCallback((codeReader: BrowserMultiFormatReader) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    // Use continuous scan with callback
    const controls = codeReader.scan(
      video,
      (result: Result | undefined, error: any | undefined) => {
        if (result) {
          handleScanResult(result.getText());
        }
        if (error && error.name !== 'NotFoundException') {
          console.warn('QR scanning error:', error.message);
        }
      }
    );
    
    scannerControlsRef.current = controls;
  }, []);

  /**
   * Handle a successful QR code scan
   */
  const handleScanResult = useCallback(async (qrData: string) => {
    cleanup();
    setState('processing');
    setErrorMessage(null);

    try {
      // Decode the QR data
      const result: QrDecodingResult = await decodeQrCode(qrData);

      if (!result.success || result.drafts.length === 0) {
        throw new QrDecodingError(
          result.error || 'Failed to decode QR code',
          result.format ? 'UNSUPPORTED_QR_TYPE' : 'INVALID_QR_FORMAT',
          qrData
        );
      }

      // Handle multiple payment options
      if (result.drafts.length > 1) {
        if (onMultipleOptions) {
          // Let parent component handle multiple options
          const options: PaymentOption[] = result.drafts.map((draft, index) => ({
            id: `option-${index}`,
            label: draft.recipientName || `Option ${index + 1}`,
            draft,
          }));
          onMultipleOptions(options);
        } else {
          // Use first option by default
          handleSingleDraft(result.drafts[0]);
        }
      } else {
        handleSingleDraft(result.drafts[0]);
      }
    } catch (err) {
      const error = err as Error;
      setErrorMessage(error.message);
      setState('error');
      onError(error);
    }
  }, [cleanup, onScanSuccess, onMultipleOptions]);

  /**
   * Handle a single payment draft
   */
  const handleSingleDraft = useCallback((draft: PaymentDraft) => {
    setState('success');
    onScanSuccess(draft);
  }, [onScanSuccess]);

  /**
   * Handle image file selection for QR scanning
   */
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!allowedImageTypes.includes(file.type)) {
      setErrorMessage(`Unsupported file type. Please upload: ${allowedImageTypes.join(', ')}`);
      setState('error');
      return;
    }

    // Validate file size
    if (file.size > maxImageSize) {
      setErrorMessage(`File is too large. Maximum size: ${maxImageSize / (1024 * 1024)}MB`);
      setState('error');
      return;
    }

    setState('processing');
    setErrorMessage(null);

    try {
      // Create image element
      const img = new Image();
      img.src = URL.createObjectURL(file);

      // Wait for image to load
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });

      // Decode QR from image
      const codeReader = new BrowserMultiFormatReader();
      const result = await codeReader.decodeFromImageElement(img);

      await handleScanResult(result.getText());
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('No MultiFormat Readers')) {
        setErrorMessage('No QR code found in the uploaded image.');
      } else {
        setErrorMessage(`Failed to read QR code from image: ${error.message}`);
      }
      setState('error');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [allowedImageTypes, maxImageSize, handleScanResult]);

  /**
   * Trigger file input click
   */
  const triggerFileUpload = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  /**
   * Handle retry
   */
  const handleRetry = useCallback(() => {
    cleanup();
    setErrorMessage(null);
    setState('idle');
    setHasCameraPermission(null);
  }, [cleanup]);

  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Initialize camera when state becomes scanning
  useEffect(() => {
    if (state === 'scanning' && !codeReaderRef.current) {
      initCamera();
    }
  }, [state, initCamera]);

  // Render different states
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="p-6">
          {state === 'idle' && (
            <div className="text-center">
              <div className="mb-6">
                <svg className="w-20 h-20 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16V6a1 1 0 011-1h16a1 1 0 011 1v10" />
                </svg>
              </div>
              
              {hasCameraPermission === false && (
                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Camera access was denied. You can still upload a QR code image.
                  </p>
                </div>
              )}

              {isCameraAvailable === false && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    No camera found on this device.
                  </p>
                </div>
              )}

              <button
                onClick={initCamera}
                disabled={hasCameraPermission === false || isCameraAvailable === false}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors mb-3"
              >
                Scan QR Code
              </button>

              {showImageUpload && (
                <button
                  onClick={triggerFileUpload}
                  className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upload QR Image
                </button>
              )}

              {/* Hidden file input */}
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
              <div className="relative w-full h-64 md:h-80 bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onError={() => setErrorMessage('Camera stream error. Please try again.')}
                />
                
                {/* Scanner Overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-4 border-2 border-blue-500 rounded-lg" />
                  <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-500 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-blue-500 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-blue-500 rounded-br-lg" />
                </div>

                {/* Scan Line Animation */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-scan-line" />
              </div>

              <canvas ref={canvasRef} className="hidden" />

              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Point your camera at a payment QR code
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  The scan will happen automatically
                </p>
              </div>
            </div>
          )}

          {state === 'processing' && (
            <div className="text-center py-8">
              <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Decoding QR code...</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400 font-medium mb-4">{errorMessage}</p>
              
              <div className="space-y-3">
                {hasCameraPermission === false && isCameraAvailable && (
                  <button
                    onClick={() => window.open('https://support.google.com/chrome/answer/2693767', '_blank')}
                    className="w-full py-2 px-4 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                  >
                    How to enable camera access
                  </button>
                )}

                <button
                  onClick={handleRetry}
                  className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  Try Again
                </button>

                {showImageUpload && (
                  <button
                    onClick={triggerFileUpload}
                    className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                  >
                    Upload QR Image Instead
                  </button>
                )}
              </div>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-600 dark:text-green-400 font-medium">QR code scanned successfully!</p>
            </div>
          )}
        </div>
      </div>

      {/* CSS Animation for scan line */}
      <style jsx>{`
        @keyframes scan-line {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
      `}</style>
    </div>
  );
}

export default PaymentQrScanner;
