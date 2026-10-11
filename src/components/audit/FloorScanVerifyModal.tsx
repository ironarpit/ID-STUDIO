import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  Camera,
  SwitchCamera,
  Image,
  AlertCircle,
  Scan,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Volume2,
  VolumeX,
  ArrowLeft,
  RotateCcw,
  Keyboard,
  Check,
  Package,
  Layers,
  Tag,
  Briefcase
} from 'lucide-react';
import { Product } from '../../types';
import { cleanBarcode } from '../../utils/fileParser';
import { playSuccessBeep, playErrorBeep, triggerVibration } from '../../utils/audio';
import { resolveScannedBarcode } from '../../utils/barcodeResolver';
import { normalizeFocusCode } from '../../utils/focusMatcher';
import { useModalTransition } from '../../utils/useModalTransition';

export interface ExpectedProductInfo {
  name: string;
  barcode: string;
  bansalCode?: string;
  mainCode?: string;
  category?: string;
  brand?: string;
  id?: string;
}

interface FloorScanVerifyModalProps {
  isOpen: boolean;
  expectedProduct: ExpectedProductInfo;
  stockProducts: Product[];
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  isDarkMode?: boolean;
  onClose: () => void;
}

type VerifyState =
  | 'scanning'
  | 'resolving'
  | 'match'
  | 'mismatch'
  | 'conflict'
  | 'not_found'
  | 'error_status';

export const FloorScanVerifyModal: React.FC<FloorScanVerifyModalProps> = ({
  isOpen,
  expectedProduct,
  stockProducts,
  soundEnabled = true,
  onToggleSound,
  isDarkMode = false,
  onClose
}) => {
  const [viewState, setViewState] = useState<VerifyState>('scanning');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [conflictCandidates, setConflictCandidates] = useState<Product[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Camera & Device State
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState<boolean>(true);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingScanRef = useRef<boolean>(false);

  // Clean the expected barcode for robust comparison
  const expectedBarcodeClean = useMemo(() => {
    return cleanBarcode(expectedProduct.barcode).trim().toLowerCase();
  }, [expectedProduct.barcode]);

  const expectedBansalClean = useMemo(() => {
    return (expectedProduct.bansalCode || '').trim().toLowerCase();
  }, [expectedProduct.bansalCode]);

  // Handle Barcode Verification Logic using shared Barcode Master resolver
  const handleVerifyBarcode = async (rawCode: string) => {
    if (!rawCode || !rawCode.trim()) return;
    setScannedCode(rawCode.trim());
    setViewState('resolving');

    try {
      const result = await resolveScannedBarcode(rawCode, stockProducts);

      // 1 & 2. Resolved current product (exact, saved override, Barcode Master, or store label fallback)
      if (
        result.resolution === 'current_stock' ||
        result.resolution === 'saved_override' ||
        result.resolution === 'barcode_master' ||
        result.resolution === 'store_label_fallback'
      ) {
        const prod = result.product;
        setFoundProduct(prod);

        const expectedCode = normalizeFocusCode(
          expectedProduct.bansalCode || expectedProduct.mainCode || ''
        );
        const resolvedCode = normalizeFocusCode(
          prod?.bansalCode || prod?.localCode || prod?.code || ''
        );

        const isMatch = Boolean(resolvedCode && expectedCode && resolvedCode === expectedCode);

        if (isMatch) {
          if (soundEnabled) playSuccessBeep();
          triggerVibration(100);
          setViewState('match');
        } else {
          if (soundEnabled) playErrorBeep();
          triggerVibration(250);
          setViewState('mismatch');
        }
        return;
      }

      // 3 & 4. Ambiguous conflict -> MUST show candidate choices, NEVER automatically choose
      if (
        result.resolution === 'current_stock_conflict' ||
        result.resolution === 'barcode_master_conflict' ||
        result.resolution === 'store_label_conflict' ||
        result.ambiguous
      ) {
        if (soundEnabled) playErrorBeep();
        setConflictCandidates(result.candidates);
        setViewState('conflict');
        return;
      }

      // 5, 6, 7. Specific mapped/unmapped error states
      if (soundEnabled) playErrorBeep();
      triggerVibration(250);
      setFoundProduct(null);

      if (result.resolution === 'mapped_product_not_in_current_stock') {
        setStatusMessage('Barcode mapped, but product is not in current stock.');
        setViewState('error_status');
      } else if (result.resolution === 'mapped_but_no_stock') {
        setStatusMessage('Barcode is mapped, but no current stock file is loaded.');
        setViewState('error_status');
      } else if (result.resolution === 'not_mapped') {
        setStatusMessage('Barcode not mapped.');
        setViewState('not_found');
      } else {
        setStatusMessage(result.message || 'Barcode lookup failed.');
        setViewState('not_found');
      }
    } catch (err: any) {
      if (soundEnabled) playErrorBeep();
      setStatusMessage(err?.message || 'Barcode resolver unavailable.');
      setViewState('not_found');
    }
  };

  const handleSelectConflictCandidate = (candidate: Product) => {
    setFoundProduct(candidate);
    const expectedCode = normalizeFocusCode(
      expectedProduct.bansalCode || expectedProduct.mainCode || ''
    );
    const candidateCode = normalizeFocusCode(
      candidate.bansalCode || candidate.localCode || candidate.code || ''
    );
    const isMatch = Boolean(candidateCode && expectedCode && candidateCode === expectedCode);

    if (isMatch) {
      if (soundEnabled) playSuccessBeep();
      triggerVibration(100);
      setViewState('match');
    } else {
      if (soundEnabled) playErrorBeep();
      triggerVibration(250);
      setViewState('mismatch');
    }
  };

  // Stop camera helper
  const stopCameraScanner = async (): Promise<void> => {
    const instance = html5QrcodeRef.current;
    html5QrcodeRef.current = null;

    if (instance) {
      try {
        await instance.stop();
      } catch (e) {
        // Ignored
      }
      try {
        instance.clear();
      } catch (e) {
        // Ignored
      }
    }

    try {
      const videoElements = document.querySelectorAll('#verify-camera-reader video');
      videoElements.forEach((v) => {
        const video = v as HTMLVideoElement;
        if (video.srcObject) {
          const stream = video.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        }
      });
    } catch (e) {
      // Ignored
    }

    setIsScanning(false);
  };

  // Start camera helper
  const startCameraScanner = async (cameraId: string) => {
    await stopCameraScanner();

    const element = document.getElementById('verify-camera-reader');
    if (!element) return;

    try {
      const html5Qrcode = new Html5Qrcode('verify-camera-reader', {
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
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.min(viewfinderWidth - 30, 320);
          const height = Math.min(viewfinderHeight - 30, 130);
          return { width: Math.max(width, 200), height: Math.max(height, 80) };
        },
        aspectRatio: 1.5
      };

      await html5Qrcode.start(
        cameraId,
        config,
        async (decodedText) => {
          if (isProcessingScanRef.current) return;
          isProcessingScanRef.current = true;

          const cleanedCode = cleanBarcode(decodedText);
          await stopCameraScanner();
          handleVerifyBarcode(cleanedCode);
          isProcessingScanRef.current = false;
        },
        () => {
          // Frame scanner pass
        }
      );

      setIsScanning(true);
      setScanError(null);
    } catch (err: any) {
      setIsScanning(false);
      setScanError(`Camera unavailable (${err?.message || 'Access Denied'}). You can enter barcode manually below.`);
      setShowManualInput(true);
    }
  };

  // Initialize camera when modal opens in scanning mode
  useEffect(() => {
    let active = true;

    if (isOpen && viewState === 'scanning') {
      setScanError(null);
      isProcessingScanRef.current = false;

      const timer = setTimeout(() => {
        if (!active) return;

        Html5Qrcode.getCameras()
          .then((devices) => {
            if (!active) return;
            if (devices && devices.length > 0) {
              setCameras(devices);
              const backCam = devices.find(
                (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment')
              );
              const defaultCamId = backCam ? backCam.id : devices[0].id;
              setSelectedCameraId(defaultCamId);
              startCameraScanner(defaultCamId);
            } else {
              setScanError('No camera found. Please enter barcode manually.');
              setShowManualInput(true);
            }
          })
          .catch(() => {
            if (!active) return;
            setScanError('Camera permission denied. Please enter barcode manually.');
            setShowManualInput(true);
          });
      }, 150);

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
  }, [isOpen, viewState]);

  // Handle resetting back to scan mode
  const handleResetScan = () => {
    setViewState('scanning');
    setScannedCode('');
    setFoundProduct(null);
    setConflictCandidates([]);
    setStatusMessage('');
    setManualCodeInput('');
    setScanError(null);
    isProcessingScanRef.current = false;
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;
    stopCameraScanner();
    handleVerifyBarcode(manualCodeInput.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imageFile = e.target.files[0];
      const html5Qrcode = new Html5Qrcode('verify-camera-reader-file', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ],
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });

      html5Qrcode
        .scanFile(imageFile, true)
        .then(async (decodedText) => {
          const cleanedCode = cleanBarcode(decodedText);
          await stopCameraScanner();
          handleVerifyBarcode(cleanedCode);
        })
        .catch(() => {
          if (soundEnabled) playErrorBeep();
          setScanError('Could not detect a clear barcode in the uploaded image.');
        });
    }
  };

  const { handleClose, backdropClass, panelClass } = useModalTransition({
    onClose: () => {
      stopCameraScanner();
      onClose();
    },
    isOpen,
    duration: 170
  });

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs ${backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCameraScanner();
          handleClose();
        }
      }}
    >
      <div className={`w-full max-w-lg overflow-hidden shadow-2xl rounded-3xl border flex flex-col max-h-[92vh] mobile-bottom-sheet ${panelClass} ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Header */}
        <div className={`p-3.5 sm:p-4 border-b flex items-center justify-between shrink-0 ${
          isDarkMode ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-2xs shrink-0">
              <Scan className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black truncate">Floor IQ • Scan to Verify</h3>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  Verification Only
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate font-medium">
                Verify physical shelf product against audit item
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                title={soundEnabled ? 'Mute sound' : 'Enable sound'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopCameraScanner();
                handleClose();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expected Audit Item Quick Banner */}
        <div className={`px-4 py-2.5 border-b text-xs flex items-center justify-between gap-2 shrink-0 ${
          isDarkMode ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-100/80 border-slate-200'
        }`}>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-0.5">
              Auditing Item:
            </span>
            <div className="font-black text-xs truncate text-slate-900 dark:text-white">
              {expectedProduct.name}
            </div>
          </div>
          <div className="text-right shrink-0 font-mono text-[11px]">
            <div className="text-indigo-600 dark:text-indigo-400 font-black">
              {expectedProduct.barcode || 'NO BARCODE'}
            </div>
            {expectedProduct.bansalCode && (
              <div className="text-[10px] text-slate-500 font-sans">
                Code: <strong className="font-mono">{expectedProduct.bansalCode}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-4">

          {/* VIEW 1: ACTIVE CAMERA SCANNING */}
          {viewState === 'scanning' && (
            <div className="space-y-3">
              {/* Prominent Instruction Banner */}
              <div className="p-3 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/80 space-y-1 text-slate-900 dark:text-slate-100">
                <div className="flex items-center gap-1.5 font-black text-xs text-indigo-700 dark:text-indigo-300">
                  <Scan className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Scan the Physical Item:</span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  • Point your camera at the barcode on the product/shelf tag.
                </p>
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  • (If camera access is blocked, click <strong className="text-indigo-600 dark:text-indigo-300">Manual Entry</strong> below to type the barcode or Bansal Code).
                </p>
              </div>

              <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-300 dark:border-slate-700 aspect-4/3 flex flex-col items-center justify-center min-h-[220px]">
                <div id="verify-camera-reader" className="w-full h-full"></div>
                <div id="verify-camera-reader-file" className="hidden"></div>

                {!isScanning && !scanError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 p-4 text-center">
                    <Camera className="w-8 h-8 animate-pulse mb-2 text-indigo-400" />
                    <p className="text-xs font-semibold">Starting camera scanner...</p>
                  </div>
                )}

                {scanError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-xs text-amber-200 font-medium max-w-xs">{scanError}</p>
                  </div>
                )}
              </div>

              {/* Camera Switcher & File Upload Bar */}
              <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                {cameras.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <SwitchCamera className="w-3.5 h-3.5 text-indigo-600" />
                    <select
                      value={selectedCameraId}
                      onChange={(e) => {
                        setSelectedCameraId(e.target.value);
                        startCameraScanner(e.target.value);
                      }}
                      className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs font-medium"
                    >
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label || `Camera ${c.id.substring(0, 4)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold px-2.5 py-1.5 rounded-xl cursor-pointer"
                  >
                    <Image className="w-3.5 h-3.5 text-amber-600" />
                    <span>Upload Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1.5 rounded-xl cursor-pointer"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>{showManualInput ? 'Hide Keypad' : 'Manual Entry'}</span>
                  </button>
                </div>
              </div>

              {/* Manual Barcode Entry Form */}
              {showManualInput && (
                <form onSubmit={handleManualSubmit} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="text-[11px] font-black text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Keyboard className="w-3.5 h-3.5 text-indigo-600" />
                    Enter Barcode or Bansal Code Manually
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={manualCodeInput}
                      onChange={(e) => setManualCodeInput(e.target.value)}
                      placeholder="Type barcode or code number..."
                      className="flex-1 px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!manualCodeInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer active:scale-95"
                    >
                      Verify
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* VIEW 2: EXACT MATCH (✅ CORRECT PRODUCT) */}
          {viewState === 'match' && (
            <div className="space-y-4 animate-scale-up text-center py-2">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-2">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-emerald-700 dark:text-emerald-400">
                  ✅ CORRECT PRODUCT
                </h4>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                  Scanned barcode matches this audit product.
                </p>
              </div>

              {/* Verified Product Card */}
              <div className="p-4 rounded-2xl border bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-left space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                    Product Name
                  </span>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {expectedProduct.name}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 font-mono text-xs">
                  <div>
                    <span className="text-[10px] font-sans uppercase font-black text-slate-400 block">
                      Barcode
                    </span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {expectedProduct.barcode || 'N/A'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] font-sans uppercase font-black text-slate-400 block">
                      Bansal Code
                    </span>
                    <strong className="text-slate-900 dark:text-white">
                      {expectedProduct.bansalCode || expectedProduct.mainCode || '—'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: BARCODE DOES NOT MATCH (❌ WRONG PRODUCT) */}
          {viewState === 'mismatch' && foundProduct && (
            <div className="space-y-3.5 animate-scale-up">
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-700 dark:text-rose-400">
                    ❌ WRONG PRODUCT
                  </h4>
                  <p className="text-xs text-rose-800 dark:text-rose-300 font-medium">
                    Scanned barcode belongs to a different item in your stock.
                  </p>
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                {/* Expected Product */}
                <div className="p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                    <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 flex items-center gap-1">
                      <Package className="w-3 h-3 text-slate-400" />
                      EXPECTED PRODUCT
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                      In Audit
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Product Name</span>
                    <div className="font-black text-slate-900 dark:text-white leading-tight">
                      {expectedProduct.name}
                    </div>
                  </div>

                  <div className="font-mono text-[11px] space-y-1 pt-1">
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Barcode</span>
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        {expectedProduct.barcode || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Bansal Code</span>
                      <strong className="text-slate-800 dark:text-slate-200">
                        {expectedProduct.bansalCode || expectedProduct.mainCode || '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Scanned Product */}
                <div className="p-3.5 rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
                  <div className="flex items-center justify-between border-b border-rose-200 dark:border-rose-900/50 pb-1.5">
                    <span className="text-[10px] uppercase font-black tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1">
                      <Scan className="w-3 h-3 text-rose-600" />
                      SCANNED PRODUCT
                    </span>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                      Physical Item
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Product Name</span>
                    <div className="font-black text-rose-900 dark:text-rose-200 leading-tight">
                      {foundProduct.name}
                    </div>
                  </div>

                  <div className="font-mono text-[11px] space-y-1 pt-1">
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Barcode</span>
                      <strong className="text-rose-600 dark:text-rose-400">
                        {foundProduct.barcode || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Bansal Code</span>
                      <strong className="text-slate-900 dark:text-slate-100">
                        {foundProduct.bansalCode || foundProduct.localCode || foundProduct.code || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Main Code</span>
                      <strong className="text-slate-800 dark:text-slate-300 font-sans">
                        {foundProduct.mainCode || foundProduct.category || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-400 block">Category & Brand</span>
                      <span className="font-sans text-slate-700 dark:text-slate-300">
                        {foundProduct.category || 'General'} {foundProduct.brand ? `• ${foundProduct.brand}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* VIEW: RESOLVING IN PROGRESS */}
          {viewState === 'resolving' && (
            <div className="py-10 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Resolving Barcode via Barcode Master...
              </div>
              <div className="text-xs font-mono text-slate-400">{scannedCode}</div>
            </div>
          )}

          {/* VIEW: AMBIGUOUS CONFLICT CHOICE */}
          {viewState === 'conflict' && (
            <div className="space-y-3 animate-scale-up">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
                    ⚠ AMBIGUOUS BARCODE MATCH
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Multiple stock products match this barcode. Please manually select the physical item you scanned:
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {conflictCandidates.map((candidate, idx) => {
                  const cCode = candidate.bansalCode || candidate.localCode || candidate.code || 'N/A';
                  const cStock = candidate.stock ?? candidate.closingStock ?? 0;
                  const cMrp = candidate.mrp ?? 0;

                  return (
                    <div
                      key={candidate.id || `${cCode}-${idx}`}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-bold text-xs truncate text-slate-900 dark:text-white">
                          {candidate.name || candidate.itemName}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                            Code: {cCode}
                          </span>
                          <span className="text-slate-500">Stock: {cStock}</span>
                          <span className="text-slate-500">MRP: ₹{cMrp}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectConflictCandidate(candidate)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Select
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: SPECIFIC ERROR STATUS (mapped but no stock, mapped not in stock) */}
          {viewState === 'error_status' && (
            <div className="space-y-4 animate-scale-up py-2 text-center">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md mb-2">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
                  {statusMessage || 'Barcode Issue Detected'}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1 max-w-sm">
                  This barcode is mapped in Barcode Master, but cannot be verified against the current store stock.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-left space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans text-[11px]">Scanned Barcode:</span>
                  <span className="font-bold text-amber-600 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded">
                    {scannedCode || 'Empty'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: BARCODE NOT FOUND IN CURRENT STOCK / NOT MAPPED */}
          {viewState === 'not_found' && (
            <div className="space-y-4 animate-scale-up py-2 text-center">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md mb-2">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
                  {statusMessage || 'Barcode not mapped.'}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1 max-w-sm">
                  The scanned barcode does not exist in Barcode Master or the active stock catalog.
                </p>
              </div>

              {/* Scanned & Expected comparison snippet */}
              <div className="p-3.5 rounded-2xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-left space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans text-[11px]">Scanned Barcode:</span>
                  <span className="font-bold text-amber-600 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded">
                    {scannedCode || 'Empty'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 font-sans text-[11px]">Expected Barcode:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {expectedProduct.barcode}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className={`p-3.5 border-t flex items-center justify-between gap-2 shrink-0 ${
          isDarkMode ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          {viewState === 'scanning' ? (
            <button
              type="button"
              onClick={() => {
                stopCameraScanner();
                handleClose();
              }}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel & Back to Audit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleResetScan}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black text-xs transition-colors cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Scan Again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCameraScanner();
                  handleClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Continue Auditing</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
