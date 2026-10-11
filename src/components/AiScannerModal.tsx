import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  PlusCircle, 
  Search,
  PackageCheck,
  Image as ImageIcon,
  SwitchCamera
} from 'lucide-react';
import { Product } from '../types';
import { cleanBarcode } from '../utils/fileParser';

interface ExtractedAiProduct {
  id: string;
  name: string;
  barcode: string;
  localCode?: string;
  mrp: number;
  costPrice?: number;
  retailPrice: number;
  salePrice: number;
  stock: number;
  category: string;
  unit?: string;
}

interface CandidateMatch {
  product: Product;
  score: number;
  matchReasons: string[];
}

interface AiScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stockProducts: Product[];
  onSelectProduct: (product: Product) => void;
  onOpenLabelModal: (product: Product) => void;
  onAddProductsToStock?: (products: Product[]) => void;
}

export const AiScannerModal: React.FC<AiScannerModalProps> = ({
  isOpen,
  onClose,
  stockProducts,
  onSelectProduct,
  onOpenLabelModal,
  onAddProductsToStock,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedProduct, setExtractedProduct] = useState<ExtractedAiProduct | null>(null);
  const [candidateMatches, setCandidateMatches] = useState<CandidateMatch[]>([]);
  const [manualQuery, setManualQuery] = useState<string>('');
  
  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedFacingMode, setSelectedFacingMode] = useState<'environment' | 'user'>('environment');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Automatically start camera when modal opens
  useEffect(() => {
    let active = true;

    if (isOpen) {
      setError(null);
      setExtractedProduct(null);
      setCandidateMatches([]);
      setImagePreview(null);
      
      // Delay slightly so DOM element <video> mounts cleanly
      const timer = setTimeout(() => {
        if (active) {
          startLiveCamera('environment');
        }
      }, 50);

      return () => {
        active = false;
        clearTimeout(timer);
        stopLiveCamera();
      };
    } else {
      stopLiveCamera();
    }
  }, [isOpen]);

  // Ensure stream is connected to videoRef whenever camera becomes active or videoRef mounts
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  };

  const startLiveCamera = async (facingMode: 'environment' | 'user' = 'environment') => {
    stopLiveCamera();
    setError(null);
    setIsCameraLoading(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: facingMode }, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setSelectedFacingMode(facingMode);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        setCameraDevices(videoDevs);
      }
    } catch (err: any) {
      setIsCameraActive(false);
      setError('Unable to open camera automatically. Please grant camera permission in browser settings or click "Upload Image File".');
    } finally {
      setIsCameraLoading(false);
    }
  };

  const toggleCameraFacingMode = () => {
    const nextMode = selectedFacingMode === 'environment' ? 'user' : 'environment';
    startLiveCamera(nextMode);
  };

  // Search candidate products in stock database
  const findCandidateProducts = (
    extracted: { name: string; barcode?: string; localCode?: string },
    overrideQuery?: string
  ): CandidateMatch[] => {
    if (!stockProducts || stockProducts.length === 0) return [];

    const query = overrideQuery !== undefined ? overrideQuery : extracted.name;
    const rawBar = extracted.barcode ? extracted.barcode.trim().toLowerCase() : '';
    const cleanBar = extracted.barcode ? cleanBarcode(extracted.barcode).toLowerCase() : '';
    const rawLocal = extracted.localCode ? extracted.localCode.trim().toLowerCase() : '';
    const cleanLocal = extracted.localCode ? cleanBarcode(extracted.localCode).toLowerCase() : '';

    const queryLower = query.trim().toLowerCase();
    const queryTokens = queryLower
      .split(/[\s,\.\/\-\_\+]+/)
      .filter(t => t.length >= 2);

    const matches: CandidateMatch[] = [];

    stockProducts.forEach(p => {
      let score = 0;
      const reasons: string[] = [];

      const pBar = p.barcode.trim().toLowerCase();
      const pCleanBar = cleanBarcode(p.barcode).toLowerCase();
      const pLocal = p.localCode ? p.localCode.trim().toLowerCase() : '';
      const pCleanLocal = p.localCode ? cleanBarcode(p.localCode).toLowerCase() : '';
      const pName = p.name.trim().toLowerCase();

      // Barcode match
      if (rawBar && (pBar === rawBar || pCleanBar === cleanBar)) {
        score += 100;
        reasons.push('Exact Barcode Match');
      }

      // Local Code match
      if (rawLocal && (pLocal === rawLocal || (pCleanLocal && pCleanLocal === cleanLocal))) {
        score += 90;
        reasons.push('Bansal / Local Code Match');
      }

      // Name match
      if (queryLower && pName === queryLower) {
        score += 80;
        reasons.push('Exact Name Match');
      } else if (queryLower && (pName.includes(queryLower) || queryLower.includes(pName))) {
        score += 50;
        reasons.push('Name Contains Keyword');
      }

      // Token word matching
      if (queryTokens.length > 0) {
        let matchedTokens = 0;
        queryTokens.forEach(token => {
          if (pName.includes(token) || pBar.includes(token) || pLocal.includes(token)) {
            matchedTokens++;
          }
        });
        if (matchedTokens > 0) {
          score += matchedTokens * 15;
          reasons.push(`${matchedTokens} Keyword Matches`);
        }
      }

      if (score > 0) {
        matches.push({
          product: p,
          score,
          matchReasons: reasons,
        });
      }
    });

    matches.sort((a, b) => b.score - a.score);
    return matches;
  };

  const processImageFile = async (selectedFile: File) => {
    stopLiveCamera();
    setError(null);
    setIsScanning(true);
    setFile(selectedFile);
    setExtractedProduct(null);
    setCandidateMatches([]);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Url = e.target?.result as string;
          setImagePreview(base64Url);
          const base64Data = base64Url.split(',')[1];
          const mimeType = selectedFile.type || 'image/jpeg';

          const customPrompt = "Examine this product photo, packaging, or price tag image. Extract the product details including product name, barcode or SKU if visible, Bansal Code/local code, MRP, cost price, retail price, category, and unit. Provide clean structured JSON.";

          const res = await fetch('/api/gemini/scan-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              imageBase64: base64Data, 
              mimeType,
              prompt: customPrompt 
            }),
          });

          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || 'AI failed to analyze photo.');
          }

          if (!data.products || data.products.length === 0) {
            throw new Error('No product detected in image. Please ensure item packaging is clear.');
          }

          const item = data.products[0];
          const rawBar = item.barcode ? cleanBarcode(item.barcode) : '';
          const genBar = rawBar || `${Math.floor(100000000000 + Math.random() * 900000000000)}`;

          const extracted: ExtractedAiProduct = {
            id: `ai_scan_${Date.now()}`,
            name: item.name || 'Unnamed Product',
            barcode: genBar,
            localCode: item.localCode ? item.localCode.trim() : undefined,
            mrp: Number(item.mrp) || Number(item.retailPrice) || 0,
            costPrice: Number(item.costPrice) || 0,
            retailPrice: Number(item.retailPrice) || Number(item.mrp) || 0,
            salePrice: Number(item.salePrice) || Number(item.retailPrice) || Number(item.mrp) || 0,
            stock: Number(item.stock) > 0 ? Number(item.stock) : 1,
            category: item.category || 'General',
            unit: item.unit || 'Pcs',
          };

          setExtractedProduct(extracted);
          setManualQuery(extracted.name);

          const matches = findCandidateProducts(extracted, extracted.name);
          setCandidateMatches(matches);

        } catch (err: any) {
          setError(err.message || 'Gemini AI photo analysis error.');
        } finally {
          setIsScanning(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setError(err.message || 'Failed to read image file');
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError('Camera video feed loading. Please try clicking the photo icon again in a second.');
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const capturedFile = new File([blob], `camera_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
          processImageFile(capturedFile);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedProduct) return;
    const matches = findCandidateProducts(extractedProduct, manualQuery);
    setCandidateMatches(matches);
  };

  const handleSelectCandidate = (candidate: Product) => {
    stopLiveCamera();
    onSelectProduct(candidate);
    onClose();
  };

  const handleAddNewProductToStock = () => {
    if (!extractedProduct) return;

    const newProd: Product = {
      id: extractedProduct.id,
      barcode: extractedProduct.barcode,
      name: extractedProduct.name,
      category: extractedProduct.category,
      mrp: extractedProduct.mrp,
      costPrice: extractedProduct.costPrice,
      retailPrice: extractedProduct.retailPrice,
      salePrice: extractedProduct.salePrice,
      stock: extractedProduct.stock,
      localCode: extractedProduct.localCode,
      unit: extractedProduct.unit,
      salesCount: 0
    };

    if (onAddProductsToStock) {
      onAddProductsToStock([newProd]);
    }

    stopLiveCamera();
    onSelectProduct(newProd);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white border border-slate-200 text-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header - App Indigo Theme */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-2xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Photo Scanner</h2>
              <p className="text-xs text-slate-500">Capture product photo to search inventory</p>
            </div>
          </div>

          <button
            onClick={() => {
              stopLiveCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Body */}
        <div className="p-4 flex-1 flex flex-col items-center justify-center bg-slate-100 relative min-h-[320px] overflow-y-auto">
          {/* Canvas for capturing snapshot */}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Live Camera Viewport - Always mounted when no extracted product & not scanning */}
          {!isScanning && !extractedProduct && (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="relative w-full max-w-md rounded-2xl overflow-hidden border border-slate-300 bg-black aspect-4/3 flex items-center justify-center shadow-inner">
                {/* Video Feed */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                />

                {/* Camera initializing loader */}
                {isCameraLoading && (
                  <div className="flex flex-col items-center gap-2 text-slate-300 text-xs">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <span>Opening camera...</span>
                  </div>
                )}

                {/* Framing Overlay Guide */}
                {isCameraActive && (
                  <div className="absolute inset-6 border-2 border-dashed border-indigo-400/80 rounded-xl pointer-events-none flex items-center justify-center">
                    <span className="bg-slate-900/80 text-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-xs shadow-md">
                      Point Camera at Product
                    </span>
                  </div>
                )}

                {/* Switch camera button overlay */}
                {isCameraActive && cameraDevices.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleCameraFacingMode}
                    className="absolute top-3 right-3 p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-xl backdrop-blur-xs border border-white/20 transition-all cursor-pointer"
                    title="Switch camera"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}

                {/* Circular Shutter Camera Icon Button */}
                {isCameraActive && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-auto">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-90 text-white flex items-center justify-center shadow-xl border-4 border-white transition-all cursor-pointer group"
                      title="Take Photo & Search"
                    >
                      <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading state when processing photo with Gemini */}
          {isScanning && (
            <div className="py-12 px-6 text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">
                AI Analyzing Photo...
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Extracting product features and searching store inventory...
              </p>
            </div>
          )}

          {/* Error Notice */}
          {error && !isScanning && !extractedProduct && (
            <div className="w-full max-w-md p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-start gap-2.5 my-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Camera Notice</p>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => startLiveCamera('environment')}
                  className="mt-1 text-indigo-700 underline font-semibold hover:text-indigo-900 cursor-pointer"
                >
                  Retry Camera
                </button>
              </div>
            </div>
          )}

          {/* Results: Identified Product & Matches */}
          {extractedProduct && !isScanning && (
            <div className="w-full space-y-4 text-left">
              {/* Product Extracted Header */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Scanned item"
                      className="w-12 h-12 rounded-xl object-cover border border-indigo-200 shadow-2xs shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-300" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                      Recognized Product
                    </span>
                    <h3 className="text-sm font-extrabold text-slate-900 truncate">
                      {extractedProduct.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
                      {extractedProduct.barcode && <span>Barcode: <strong>{extractedProduct.barcode}</strong></span>}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExtractedProduct(null);
                    setCandidateMatches([]);
                    setImagePreview(null);
                    startLiveCamera('environment');
                  }}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs px-2.5 py-1.5 rounded-xl transition-all cursor-pointer shrink-0"
                >
                  Take Another
                </button>
              </div>

              {/* Refine Query Input */}
              <form onSubmit={handleManualSearch} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Search product by name..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  Search
                </button>
              </form>

              {/* Candidate Matches */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>Store Stock Matches ({candidateMatches.length})</span>
                </h4>

                {candidateMatches.length > 0 ? (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {candidateMatches.map(({ product: p }) => (
                      <div
                        key={p.id}
                        className="p-3 bg-white border border-slate-200 hover:border-indigo-400 rounded-2xl transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-xs font-extrabold text-slate-900 truncate">
                              {p.name}
                            </h5>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {p.stock > 0 ? `${p.stock} ${p.unit || 'Pcs'}` : 'Out of stock'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                            <span>Code: {p.barcode}</span>
                            <span className="text-indigo-700 font-extrabold font-sans">
                              ₹{(p.salePrice || p.retailPrice || p.mrp || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(p)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Select</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl text-center space-y-1">
                    <p className="text-xs text-slate-600">
                      No matching product found in stock for "<strong>{manualQuery}</strong>".
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Only items present in the uploaded stock report can be searched.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <ImageIcon className="w-4 h-4 text-indigo-600" />
            <span>Upload Image File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopLiveCamera();
              onClose();
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
