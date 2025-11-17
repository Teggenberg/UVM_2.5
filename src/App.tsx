import React, { useState, useRef } from 'react';
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
    const remainingSlots = 4 - images.length;
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

  const analyzeImages = async () => {
    if (images.length === 0) {
      alert('Please upload at least one image');
      return;
    }

    setLoading(true);
    setAggregatedAnalysis(null);
    setResponseTime(null);

    const startTime = performance.now();

    try {
      // Send previews (data URLs) plus filenames to the local proxy server which holds the API key
      const payload = {
        images: images.map((file, i) => ({ dataUrl: previews[i], filename: file.name })),
      };

      const response = await axios.post('/api/analyze', payload);
      const endTime = performance.now();
      const elapsed = Math.round(endTime - startTime);
      setResponseTime(elapsed);
      console.log('Proxy /api/analyze response:', response.data, `(${elapsed}ms)`);

      // Server may return a single aggregated object under `analysis` or a legacy `analyses` array
      if (response.data?.analysis && typeof response.data.analysis === 'object') {
        const castAnalysis = response.data.analysis as AIProductIdentification;
        setAggregatedAnalysis(castAnalysis);
        setShowModal(true);
      } else {
        console.error('Unexpected response shape from /api/analyze:', response.data);
        alert('Unexpected response from analysis server. See console for details.');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      alert(`Error analyzing images: ${errorMessage}`);
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
            disabled={images.length >= 4}
            className="file-input"
            id="file-input"
          />
          <label htmlFor="file-input" className="upload-label">
            <svg className="upload-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M20 5h-3.2l-1.8-2.4A1 1 0 0 0 14.6 2H9.4a1 1 0 0 0-.4.6L7.2 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
            </svg>
            <span>Click to select images</span>
            <span className="upload-hint">({images.length}/4 images selected)</span>
          </label>
        </div>
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
            onClick={analyzeImages}
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
