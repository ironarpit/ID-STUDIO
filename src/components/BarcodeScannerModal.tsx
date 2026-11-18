import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Image, AlertCircle, Scan, CheckCircle2, Volume2, VolumeX, Lightbulb } from 'lucide-react';
import { playSuccessBeep, playErrorBeep, triggerVibration } from '../utils/audio';
import { cleanBarcode } from '../utils/fileParser';
import { ensureCameraPermission, isAndroidNative } from '../utils/platform';
import { Product } from '../types';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (scannedCode: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  products?: Product[];
}

/**
 * Validates EAN-13, EAN-8, UPC-A, and ITF-14 GS1 check digits.
 * Returns true if checksum is valid, or if code length is not GS1 standard
 * (allowing other custom/alphanumeric formats like Code 39/128).
 */
export function validateEanChecksum(barcode: string): boolean {
  if (!/^\d+$/.test(barcode)) return true; // Keep alphanumeric codes as valid
  
  const len = barcode.length;
  if (len !== 8 && len !== 12 && len !== 13 && len !== 14) {
    return true; // Not standard GS1, bypass check to prevent false-negatives on custom shortcodes
  }

  const checkDigit = parseInt(barcode[len - 1], 10);
  let sum = 0;
  
  // Weights alternate: rightmost digit before the check digit gets weight 3, next 1, next 3...
  for (let i = 0; i < len - 1; i++) {
    const digit = parseInt(barcode[i], 10);
    const posFromRight = len - 1 - i;
    const weight = posFromRight % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanResult,
  soundEnabled,
  onToggleSound,
  products = []
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [successBarcode, setSuccessBarcode] = useState<string | null>(null);
  
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs to prevent duplicate listeners, stale callbacks and previous scan states
  const isProcessingScanRef = useRef<boolean>(false);
  const consecutiveDetectionsRef = useRef<{ barcode: string; count: number }>({ barcode: '', count: 0 });

  // Clean initialization / shutdown sequence
  useEffect(() => {
    let active = true;

    if (isOpen) {
      // Start completely fresh
      setScanError(null);
      setSuccessBarcode(null);
      setIsTorchOn(false);
      setIsTorchSupported(false);
      setManualInput('');
      setShowManualInput(false);
      
      isProcessingScanRef.current = false;
      consecutiveDetectionsRef.current = { barcode: '', count: 0 };

      const timer = setTimeout(() => {
        if (!active) return;
        startCameraScanner();
      }, 200);

      return () => {
        active = false;
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }

    return () => {
      active = false;
      stopCameraScanner();
    };
  }, [isOpen]);

  const stopCameraScanner = async (): Promise<void> => {
    const instance = html5QrcodeRef.current;
    html5QrcodeRef.current = null;

    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch (e) {
        console.warn('Error stopping camera:', e);
      }
      try {
        instance.clear();
      } catch (e) {
        console.warn('Error clearing camera element:', e);
      }
    }

    // Force release all active MediaStream tracks
    try {
      const videoElements = document.querySelectorAll('#camera-reader video');
      videoElements.forEach((v) => {
        const video = v as HTMLVideoElement;
        if (video.srcObject) {
          const stream = video.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        }
      });
    } catch (e) {
      console.warn('Error releasing video tracks:', e);
    }

    setIsScanning(false);
  };

  const startCameraScanner = async () => {
    await stopCameraScanner();

    const element = document.getElementById('camera-reader');
    if (!element) return;

    try {
      if (isAndroidNative()) {
        const perm = await ensureCameraPermission();
        if (!perm.granted) {
          throw new Error(perm.errorMessage || 'Camera permission denied on Android.');
        }
      }

      const html5Qrcode = new Html5Qrcode('camera-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
      html5QrcodeRef.current = html5Qrcode;

      const config = {
        fps: 25,
        // Responsive viewport sizing
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.min(viewfinderWidth - 20, 280);
          const height = Math.min(viewfinderHeight - 20, 140);
          return { width, height };
        },
        aspectRatio: 1.0
      };

      // Auto-start preferring environment camera
      try {
        await html5Qrcode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            handleScannerFrame(decodedText);
          },
          () => {
            // Normal silent frame skip
          }
        );
      } catch (envErr) {
        // Fallback to user facing camera (for laptop testing)
        try {
          await html5Qrcode.start(
            { facingMode: 'user' },
            config,
            (decodedText) => {
              handleScannerFrame(decodedText);
            },
            () => {}
          );
        } catch (userErr: any) {
          // Final fallback to any listed camera device
          const devices = await Html5Qrcode.getCameras().catch(() => []);
          if (devices && devices.length > 0) {
            await html5Qrcode.start(
              devices[0].id,
              config,
              (decodedText) => {
                handleScannerFrame(decodedText);
              },
              () => {}
            );
          } else {
            throw new Error('Camera permissions denied or unavailable.');
          }
        }
      }

      setIsScanning(true);
      setScanError(null);

      // Check for torch support on current track
      const video = element.querySelector('video');
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities() as any;
          setIsTorchSupported(!!capabilities.torch);
        }
      }
    } catch (err: any) {
      setIsScanning(false);
      setScanError(`Camera Feed Blocked: ${err?.message || err}`);
    }
  };

  // Toggles the torch/flashlight on mobile devices
  const toggleTorch = async () => {
    if (!html5QrcodeRef.current || !isScanning) return;
    try {
      const container = document.getElementById('camera-reader');
      const video = container?.querySelector('video');
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const nextTorch = !isTorchOn;
          await track.applyConstraints({
            advanced: [{ torch: nextTorch } as any]
          });
          setIsTorchOn(nextTorch);
        }
      }
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Core Frame Decoded Handler
  const handleScannerFrame = (decodedText: string) => {
    if (isProcessingScanRef.current || successBarcode) return;

    const cleanedCode = cleanBarcode(decodedText);
    if (!cleanedCode || cleanedCode.length < 4) return; // Reject partial or invalid detections

    // Multi-Frame Debounce Confirmation
    const current = consecutiveDetectionsRef.current;
    if (current.barcode === cleanedCode) {
      current.count += 1;
    } else {
      current.barcode = cleanedCode;
      current.count = 1;
    }

    const REQUIRED_FRAMES = 3; // Must detect exactly the same barcode consistently in 3 consecutive frames
    if (current.count >= REQUIRED_FRAMES) {
      // Confirmed & Locked!
      isProcessingScanRef.current = true;
      handleBarcodeValidation(cleanedCode, 'scanner');
    }
  };

  // Validates barcode matches and checksums
  const handleBarcodeValidation = async (cleanedCode: string, _source: 'scanner' | 'captured' | 'uploaded' | 'manual') => {
    // Validate UPC/EAN checksum where applicable
    if (!validateEanChecksum(cleanedCode)) {
      if (soundEnabled) playErrorBeep();
      setScanError(`Invalid Barcode Checksum: ${cleanedCode}`);
      
      // Unlock after delay
      setTimeout(() => {
        setScanError(null);
        isProcessingScanRef.current = false;
        consecutiveDetectionsRef.current = { barcode: '', count: 0 };
      }, 1800);
      return;
    }

    // Success lock state
    if (soundEnabled) playSuccessBeep();
    triggerVibration(100);
    setSuccessBarcode(cleanedCode);
    setScanError(null);

    // Instantly release camera feed
    await stopCameraScanner();

    // Show confirmed UI briefly, then trigger callback and close
    setTimeout(() => {
      onScanResult(cleanedCode);
      onClose();
    }, 400);
  };

  // backup Action 1: Capture Frame from stream
  const handleCaptureFrame = async () => {
    if (!html5QrcodeRef.current || !isScanning) {
      setScanError('Camera feed is inactive. Start scanning first.');
      return;
    }

    try {
      const video = document.querySelector('#camera-reader video') as HTMLVideoElement;
      if (!video) {
        setScanError('Could not find active camera stream.');
        return;
      }

      // Capture frame via canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setScanError('Error rendering captured photo.');
          return;
        }

        const file = new File([blob], 'captured_barcode.jpg', { type: 'image/jpeg' });
        const tempScanner = new Html5Qrcode('camera-reader-file', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
          ],
          useBarCodeDetectorIfSupported: true,
          verbose: false
        });

        try {
          const decodedText = await tempScanner.scanFile(file, true);
          isProcessingScanRef.current = true;
          handleBarcodeValidation(cleanBarcode(decodedText), 'captured');
        } catch (err) {
          if (soundEnabled) playErrorBeep();
          setScanError('Could not decode barcode from captured photo. Keep camera steady and close.');
          setTimeout(() => setScanError(null), 3000);
        }
      }, 'image/jpeg', 0.95);
    } catch (err: any) {
      setScanError(`Capture failed: ${err.message || err}`);
    }
  };

  // backup Action 2: Choose Image from phone gallery
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imageFile = e.target.files[0];
      const tempScanner = new Html5Qrcode('camera-reader-file', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });

      tempScanner
        .scanFile(imageFile, true)
        .then((decodedText) => {
          isProcessingScanRef.current = true;
          handleBarcodeValidation(cleanBarcode(decodedText), 'uploaded');
        })
        .catch(() => {
          if (soundEnabled) playErrorBeep();
          setScanError('Could not decode barcode from gallery photo. Please select a clearer image.');
          setTimeout(() => setScanError(null), 3000);
        });
    }
  };

  // backup Action 3: Manual Code Entry Form Submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed) return;

    isProcessingScanRef.current = true;
    handleBarcodeValidation(trimmed, 'manual');
    setShowManualInput(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white font-sans animate-fade-in select-none">
      {/* 1. HEADER (TOP) */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
        <button
          onClick={() => {
            stopCameraScanner();
            onClose();
          }}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-sm font-extrabold tracking-widest uppercase text-slate-200">
          SCAN BARCODE
        </h2>

        <div className="flex items-center gap-1.5">
          {/* Flash/Torch Switch */}
          {isTorchSupported && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
                isTorchOn
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle flashlight"
            >
              <Lightbulb className="w-5 h-5" />
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all active:scale-95 cursor-pointer"
            title={soundEnabled ? 'Mute audio feedback' : 'Enable audio feedback'}
          >
            {soundEnabled ? (
              <Volume2 className="w-5 h-5 text-indigo-400" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* 2. CAMERA FRAME & VIEWPORT VIEW (CENTER) */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Invisible file scanner target */}
        <div id="camera-reader-file" className="hidden"></div>

        {/* Live camera container */}
        <div
          id="camera-reader"
          className="absolute inset-0 w-full h-full bg-black [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_video]:absolute [&_video]:inset-0 [&_canvas]:hidden"
        ></div>

        {/* Cinematic Mask Viewfinder Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
          {/* Central target window with 9999px opaque masking around it */}
          <div className="w-[280px] h-[140px] rounded-2xl relative shadow-[0_0_0_9999px_rgba(15,23,42,0.7)] border-2 border-indigo-500/40">
            {/* Elegant neon green styling corners */}
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-indigo-400 rounded-tl-md"></div>
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-indigo-400 rounded-tr-md"></div>
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-indigo-400 rounded-bl-md"></div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-indigo-400 rounded-br-md"></div>

            {/* Glowing Scan Laser */}
            <div className="absolute left-2.5 right-2.5 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/70 shadow-[0_0_8px_rgba(239,68,68,0.85)] animate-pulse"></div>
          </div>

          {/* Precise status beneath mask */}
          <div className="mt-8 text-center z-20 px-4 max-w-sm">
            {scanError ? (
              <p className="text-xs font-bold text-rose-300 bg-rose-950/90 px-4.5 py-2.5 rounded-2xl border border-rose-500/50 shadow-xl inline-flex items-center gap-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{scanError}</span>
              </p>
            ) : successBarcode ? (
              <div className="text-center bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 px-6 py-3 rounded-2xl shadow-2xl inline-block animate-scale-up">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ✓ Barcode detected
                </p>
                <p className="text-lg font-black tracking-widest mt-1 font-mono text-white">
                  {successBarcode}
                </p>
              </div>
            ) : (
              <p className="text-xs font-semibold text-slate-300 bg-slate-900/80 px-4.5 py-1.5 rounded-full border border-slate-800 shadow-md">
                Hold steady — detecting...
              </p>
            )}
          </div>
        </div>

        {/* 3. POPUP MANUAL DRAWER OVERLAY */}
        {showManualInput && (
          <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">
                  Manual Barcode Entry
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualInput(false);
                    setManualInput('');
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Barcode / SKU Number
                  </label>
                  <input
                    type="text"
                    pattern="[0-9a-zA-Z]+"
                    placeholder="e.g. 8901234567890"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value.replace(/[^0-9a-zA-Z]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-base font-mono text-white text-center focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualInput(false);
                      setManualInput('');
                    }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!manualInput.trim()}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-indigo-600/10"
                  >
                    <span>Confirm Code</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* 3. CONTROLS BAR (BOTTOM) */}
      <div className="grid grid-cols-3 gap-3.5 p-4.5 bg-slate-900 border-t border-slate-800 shrink-0">
        {/* Backup Action 1: Capture Live frame */}
        <button
          onClick={handleCaptureFrame}
          disabled={!isScanning || isProcessingScanRef.current || !!successBarcode}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40 hover:border-slate-600/50 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          <Camera className="w-5 h-5 text-indigo-400" />
          <span className="text-[10px] font-bold tracking-wide uppercase">Capture</span>
        </button>

        {/* Backup Action 2: Upload Photo */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingScanRef.current || !!successBarcode}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40 hover:border-slate-600/50 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          <Image className="w-5 h-5 text-amber-400" />
          <span className="text-[10px] font-bold tracking-wide uppercase">Upload Photo</span>
        </button>

        {/* Backup Action 3: Enter Code */}
        <button
          onClick={() => setShowManualInput(true)}
          disabled={isProcessingScanRef.current || !!successBarcode}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/40 hover:border-slate-600/50 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          <span className="text-base font-black font-mono leading-none text-emerald-400">⌨</span>
          <span className="text-[10px] font-bold tracking-wide uppercase">Enter Code</span>
        </button>
      </div>

      {/* Hidden file selector trigger */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
};
