import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

interface AIProductIdentification {
  brand: string,    // Short human-readable summary of the group
  brandModel: string,     //exact model or sub-model 
  finish: string | null,     //exact finish (e.g., "TV Yellow", "Surf Green", etc.)
  musicalInstrumentCategory: string,       // Common features across images
  condition: string,      // A concise recommendation or conclusion
  notedBlemishes: string[],          // any blemishes shown in the images
  metadataSummary: {
    serialNumber: string | null,  //serial number if visible
    colors: string[] | null,
    materials: string[] | null,
    estimatedValue: string | null
  };
}

function App() {
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [aggregatedAnalysis, setAggregatedAnalysis] = useState<AIProductIdentification | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialPromptVisible, setInitialPromptVisible] = useState(true);
  const [initialInput, setInitialInput] = useState('');

  // Capture / flow state for new camera workflow
  const [mode, setMode] = useState<'landing' | 'capture' | 'app'>('landing');
  const [category, setCategory] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captureIndex, setCaptureIndex] = useState(0);
  const captureSteps = [
    'Full frontal (show whole instrument)',
    'Headstock front',
    'Headstock back',
    'Full rear (back of body)',
    'Close-up of front of body (bridge/pickups)'
  ];
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);

  // Camera lifecycle and capture helpers (inside App so refs/state are available)
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera start failed', err);
      alert('Unable to access camera. You can still upload images from files.');
    }
  };

  const stopCamera = () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        // @ts-ignore
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (mode === 'capture') startCamera();
    return () => { if (mode !== 'capture') stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPreviews(prev => {
      const next = [...prev];
      next[captureIndex] = dataUrl;
      return next;
    });
    setCaptureIndex(i => Math.min(captureSteps.length - 1, i + 1));
  };

  const finishCaptureAndReview = async () => {
    const files: File[] = [];
    for (let i = 0; i < capturedPreviews.length; i++) {
      const d = capturedPreviews[i];
      if (!d) continue;
      const res = await fetch(d);
      const blob = await res.blob();
      const file = new File([blob], `${category || 'item'}-capture-${i + 1}.jpg`, { type: blob.type });
      files.push(file);
    }
    setImages(files);
    setPreviews(capturedPreviews);
    stopCamera();
    setMode('app');
    return { files, previews: capturedPreviews };
  };

  // Compress image to 2MB or smaller if needed
  const compressImage = (file: File, maxSizeMB: number = 2): Promise<File> => {
    return new Promise((resolve) => {
      if (file.size <= maxSizeMB * 1024 * 1024) {
        // Image is already under size limit
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Start with original dimensions
          let quality = 0.9;

          const compress = () => {
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
            }

            canvas.toBlob(
              (blob) => {
                if (blob && blob.size <= maxSizeMB * 1024 * 1024) {
                  // Achieved target size
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: file.lastModified,
                  });
                  resolve(compressedFile);
                } else if (quality > 0.1) {
                  // Reduce quality and retry
                  quality -= 0.1;
                  compress();
                } else if (width > 1000) {
                  // If quality reduction isn't enough, reduce dimensions
                  width = Math.floor(width * 0.9);
                  height = Math.floor(height * 0.9);
                  quality = 0.9;
                  compress();
                } else {
                  // Fallback: return what we have
                  const compressedFile = new File([blob || file], file.name, {
                    type: 'image/jpeg',
                    lastModified: file.lastModified,
                  });
                  resolve(compressedFile);
                }
              },
              'image/jpeg',
              quality
            );
          };

          compress();
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const remainingSlots = 5 - images.length;
    const filesToAdd = files.slice(0, remainingSlots);

    // Compress files if needed and collect previews
    const compressedFiles: File[] = [];
    for (const file of filesToAdd) {
      const compressed = await compressImage(file);
      compressedFiles.push(compressed);

      // Generate preview from compressed file
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(compressed);
    }

    setImages(prev => [...prev, ...compressedFiles]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const analyzeImages = async (imagesArg?: File[], previewsArg?: string[]) => {
    const useImages = imagesArg ?? images;
    const usePreviews = previewsArg ?? previews;
    if (!useImages || useImages.length === 0) {
      alert('Please upload at least one image');
      return;
    }

    setLoading(true);
    setAggregatedAnalysis(null);
    setResponseTime(null);

    const startTime = performance.now();

    try {
      // Send previews (data URLs) plus filenames to the backend server which holds the API key
      const payload = {
        images: useImages.map((file, i) => ({ dataUrl: usePreviews[i], filename: file.name })),
      };
      console.log('Sending /api/analyze payload:', payload);

      // Use backend URL from environment or fall back to relative path so Vite proxy works in dev
      const apiUrl = ((import.meta as any).env.VITE_API_URL as string | undefined) || '/api/analyze';
      const response = await axios.post(apiUrl, payload);
      const endTime = performance.now();
      const elapsed = Math.round(endTime - startTime);
      setResponseTime(elapsed);
      console.log('Backend /api/analyze response:', response.data, `(${elapsed}ms)`);

      // Server may return a single aggregated object under `analysis` or a legacy `analyses` array
      if (response.data?.analysis && typeof response.data.analysis === 'object') {
        const castAnalysis = response.data.analysis as AIProductIdentification;
        setAggregatedAnalysis(castAnalysis);
        setShowModal(true);
      } else {
        // Build a best-effort fallback analysis so the UI can display useful info instead of failing
        console.error('Unexpected response shape from /api/analyze:', response.data);
        const raw = response.data || {};
        const src = raw.analysis || raw;
        const fallback: AIProductIdentification = {
          brand: src?.brand ?? (src?.aggregateSummary ?? 'Unknown'),
          brandModel: src?.brandModel ?? (src?.brand_model ?? 'Unknown'),
          finish: src?.finish ?? null,
          musicalInstrumentCategory: src?.musicalInstrumentCategory ?? (src?.category ?? 'Unknown'),
          condition: src?.condition ?? (src?.recommendation ?? 'Unknown'),
          notedBlemishes: Array.isArray(src?.notedBlemishes) ? src.notedBlemishes : (src?.notedBlemishes ? [String(src.notedBlemishes)] : []),
          metadataSummary: {
            serialNumber: src?.metadataSummary?.serialNumber ?? src?.serialNumber ?? null,
            colors: src?.metadataSummary?.colors ?? src?.colors ?? null,
            materials: src?.metadataSummary?.materials ?? src?.materials ?? null,
            estimatedValue: src?.metadataSummary?.estimatedValue ?? src?.estimatedValue ?? null,
          },
        };
        setAggregatedAnalysis(fallback);
        setShowModal(true);
        console.warn('Displayed fallback analysis built from server response; check console for raw response', raw);
      }
    } catch (error: any) {
      // Prefer readable server error body when available
      const serverData = error.response?.data;
      const errorMessage = serverData?.error?.message || serverData?.error || serverData || error.message;
      alert(`Error analyzing images: ${JSON.stringify(errorMessage)}`);
      console.error('Analysis error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInitialSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Require exact match 'Music' to proceed (no hint shown)
    if (initialInput === 'Music') {
      setInitialPromptVisible(false);
    } else {
      // Do not provide hints; clear input to avoid revealing correctness
      setInitialInput('');
    }
  };

  // The app uses a server-side proxy for OpenAI requests, so no client API key is required.

  return (
    <>
      <div className={`container ${initialPromptVisible ? 'blurred' : ''}`}>
      

      {mode === 'capture' && (
        <div>
          <h2 style={{ textAlign: 'center' }}>Capture photos — {category}</h2>
          <div className="camera-container">
            <video ref={videoRef} className="camera-video" playsInline muted />
            <button
              className="camera-cancel-btn"
              aria-label="Close camera"
              onClick={() => { stopCamera(); setMode('landing'); }}
            >
              ✕
            </button>
            <div className="camera-overlay">
              <div className="overlay-step">Step {Math.min(captureIndex + 1, captureSteps.length)} / {captureSteps.length}</div>
              <div className="overlay-instruction">{captureSteps[captureIndex] || captureSteps[captureSteps.length - 1]}</div>
            </div>
          </div>
          <div className="capture-controls">
            <button className="btn" onClick={() => { setCapturedPreviews([]); setCaptureIndex(0); }}>Reset</button>
            <button className="capture-btn" onClick={capturePhoto} aria-label="Take photo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8.5C9.515 8.5 7.5 10.515 7.5 13C7.5 15.485 9.515 17.5 12 17.5C14.485 17.5 16.5 15.485 16.5 13C16.5 10.515 14.485 8.5 12 8.5Z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 7H16.8L15.4 5H8.6L7.2 7H4" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="3" fill="white" opacity="0.15"/>
              </svg>
            </button>
            <button className="btn btn-primary" onClick={async () => {
              if (capturedPreviews.filter(Boolean).length < captureSteps.length) return;
              const result = await finishCaptureAndReview();
              await analyzeImages(result?.files, result?.previews);
            }} disabled={capturedPreviews.filter(Boolean).length < captureSteps.length}>Generate</button>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="preview-grid">
              {Array.from({ length: captureSteps.length }).map((_, i) => (
                <div key={i} className="preview-card">
                  {capturedPreviews[i] ? <img src={capturedPreviews[i]} alt={`capture-${i}`} /> : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>No photo</div>}
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>{captureSteps[i]}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={async () => { setCaptureIndex(i); await startCamera(); }}>Retake</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <h1>U V M</h1>
        <h3>[ PROTOTYPE ]</h3>
        <p>AI driven product identification and data generation</p>
        {/* Using server-side API key; no client-side key needed */}
      </header>

      <div className="upload-section">
        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            disabled={images.length >= 5}
            className="file-input"
            id="file-input"
          />
          <label htmlFor="file-input" className="upload-label">
            <svg className="upload-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M20 5h-3.2l-1.8-2.4A1 1 0 0 0 14.6 2H9.4a1 1 0 0 0-.4.6L7.2 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
            </svg>
            <span>Click to select images</span>
            <span className="upload-hint">({images.length}/5 images selected)</span>
          </label>
        </div>
      </div>

      {/* Category selector moved below upload area for mobile-first UX; render always so users can change category after capture */}
      <div style={{ textAlign: 'center', padding: '18px 0' }}>
        <h3 style={{ margin: '6px 0' }}>Select Instrument Category</h3>
        <div className="category-row">
          {['Guitar','Pedal','Amp','Other'].map(cat => (
            <button
              key={cat}
              className={`btn ${category === cat ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setCategory(cat); setMode('capture'); }}
            >
              {cat}
            </button>
          ))}
        </div>
        {mode === 'landing' && (
          <p style={{ marginTop: 12, color: '#666', fontSize: 13 }}>You'll be guided to capture 5 photos for the selected category.</p>
        )}
      </div>

      {images.length > 0 && (
        <div className="preview-grid">
          {previews.map((preview, index) => (
            <div key={index} className="preview-card">
              <img src={preview} alt={`Preview ${index + 1}`} />
              <button
                onClick={() => removeImage(index)}
                className="remove-btn"
                aria-label="Remove image"
              >
                ✕
              </button>
              <p className="preview-filename">{images[index].name}</p>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="action-buttons">
          <button
            onClick={() => analyzeImages()}
            disabled={loading || images.length === 0}
            className="btn btn-primary"
          >
            {loading ? 'Analyzing...' : 'Generate Details'}
          </button>
          <button
            onClick={() => {
              setImages([]);
              setPreviews([]);
              setAggregatedAnalysis(null);
            }}
            className="btn btn-secondary"
          >
            Clear All
          </button>
        </div>
      )}

      {showModal && aggregatedAnalysis && (
        <>
          <div className="modal-overlay" onClick={() => setShowModal(false)} />
          <div className="modal-container">
            <button
              className="modal-close-btn"
              onClick={() => setShowModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="modal-content">
              <h2>AI Product Identification</h2>
              <div className="identification-content">
                <div className="id-section">
                  <span className="id-attribute"><strong>Brand:</strong> {aggregatedAnalysis.brand}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Model:</strong> {aggregatedAnalysis.brandModel}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Finish:</strong> {aggregatedAnalysis.finish}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Category:</strong> {aggregatedAnalysis.musicalInstrumentCategory}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Condition:</strong> {aggregatedAnalysis.condition}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Serial Number:</strong> {aggregatedAnalysis.metadataSummary.serialNumber}</span>
                </div>
                <div className="id-section">
                  <span className="id-attribute"><strong>Value:</strong> {aggregatedAnalysis.metadataSummary.estimatedValue}</span>
                </div>
                {aggregatedAnalysis.notedBlemishes && aggregatedAnalysis.notedBlemishes.length > 0 && (
                  <div className="id-section">
                    <strong>Noted Blemishes:</strong>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      {aggregatedAnalysis.notedBlemishes.map((blemish, idx) => (
                        <li key={idx}>{blemish}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {responseTime !== null && (
                <div className="modal-footer">
                  <p className="response-time">Response time: {responseTime}ms</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
      {initialPromptVisible && (
        <>
          <div className="initial-overlay" />
          <div className="initial-modal" role="dialog" aria-modal="true">
            <form onSubmit={handleInitialSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="initial-input"
                value={initialInput}
                onChange={(e) => setInitialInput(e.target.value)}
                aria-label="Enter to continue"
                autoFocus
              />
              <button type="submit" className="initial-submit">Enter</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

export default App;
