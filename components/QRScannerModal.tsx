import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onScan }) => {
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Play synthetic quick high-quality check beep via Web Audio API 
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch notification chime
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      console.warn("Audio Context playback ignored or disabled", e);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      // Request standard webcam access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setHasCamera(true);
        setIsScanning(true);
        // Start the frame processor
        animationFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
    } catch (err: any) {
      console.warn("Camera media access failed", err);
      setHasCamera(false);
      setCameraError(err?.message || "Camera blocked or permission denied.");
    }
  };

  const stopCamera = () => {
    setIsScanning(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const processVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
      animationFrameRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = 300;
      canvas.height = 300;
      
      // Mirror if it's user facing, else let's draw standard center-crop
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert"
      });

      if (code && code.data) {
        playBeep();
        onScan(code.data);
        stopCamera();
        return; // Stop matching loop
      }
    }

    animationFrameRef.current = requestAnimationFrame(processVideoFrame);
  };

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processQRImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processQRImageFile(e.target.files[0]);
    }
  };

  const processQRImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (code && code.data) {
            playBeep();
            onScan(code.data);
          } else {
            alert("No recognizable restaurant QR code found in this image. Make sure it is sharp and well-lit.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 sm:p-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      
      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-950 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-lg relative z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <header className="px-8 py-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <i className="fas fa-qrcode text-brand-500 animate-pulse"></i>
              Live QR Scanner
            </h3>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
              Position inside the red scanner box
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white">
            <i className="fas fa-times text-base"></i>
          </button>
        </header>

        {/* Content */}
        <div className="p-8 flex flex-col items-center gap-6">
          
          {/* Scanning Box Screen */}
          <div className="relative w-64 h-64 mx-auto rounded-[2rem] overflow-hidden border-4 border-slate-200 dark:border-slate-850 bg-slate-950 shadow-inner flex items-center justify-center">
            
            {hasCamera && (
              <>
                <video 
                  ref={videoRef} 
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline 
                  muted 
                />
                
                {/* Laser scan line overlay */}
                <div className="absolute left-0 right-0 h-1 bg-red-500 shadow-[0_0_15px_3px_rgba(239,68,68,0.7)] z-10 animate-[bounce_3s_infinite]" />
                
                {/* Corner reticle highlights */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-red-500 rounded-tl-md"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-red-500 rounded-tr-md"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-red-500 rounded-bl-md"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-red-500 rounded-br-md"></div>
              </>
            )}

            {!hasCamera && (
              <div className="text-center p-6 text-slate-400">
                <i className="fas fa-video-slash text-4xl mb-3 text-slate-500"></i>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-normal">
                  {cameraError ? 'Webcam Blocked' : 'Initializing camera...'}
                </p>
                <p className="text-[8.5px] font-black text-slate-600 uppercase tracking-wider mt-1.5 leading-relaxed max-w-[200px]">
                  Bypass with a QR image upload below.
                </p>
              </div>
            )}

            {/* Hidden canvas for extraction */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Fallback File Uploader Container */}
          <div className="w-full">
            <div className="text-center text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
              — OR —
            </div>
            
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all relative ${
                dragActive 
                  ? 'border-brand-500 bg-brand-500/5 dark:bg-brand-500/10 scale-[1.02]' 
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30'
              }`}
            >
              <input 
                type="file" 
                id="qr-file-upload" 
                accept="image/*"
                onChange={handleFileChange}
                className="hidden" 
              />
              <label 
                htmlFor="qr-file-upload" 
                className="cursor-pointer flex flex-col items-center gap-1.5"
              >
                <i className="fas fa-cloud-arrow-up text-lg text-slate-400 dark:text-slate-600"></i>
                <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Select or Drag & Drop QR Image
                </span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                  Supports screenshots & photo files
                </span>
              </label>
            </div>
          </div>

        </div>

        {/* Footer info banner */}
        <footer className="px-8 py-5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/40 text-center text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Scannable targets: Dining Station tables & Menu items
        </footer>

      </div>
    </div>
  );
};
