import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Loader2, FileText, Copy, Check, AlertCircle, Trash2, Download, ChevronDown, ChevronUp, RefreshCw, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateHighLogoMetadata, HighLogoMetadata } from '../services/geminiService';
import { getRateLimitState, subscribeToRateLimit, RateLimitState } from '../services/rateLimitService';
import { set, get, del } from 'idb-keyval';

export interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  metadata?: HighLogoMetadata;
  status: 'pending' | 'generating' | 'success' | 'error';
  error?: string;
  isExpanded?: boolean;
  isLoaded?: boolean;
  isConverting?: boolean;
  convertedBase64?: string;
}

export default function HighLogoGenerator() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedTags, setCopiedTags] = useState<Record<string, boolean>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>(getRateLimitState());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const successCount = items.filter(item => item.status === 'success').length;

  useEffect(() => {
    return subscribeToRateLimit(setRateLimitState);
  }, []);

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedItems = await get('highlogo_items');
        if (savedItems && Array.isArray(savedItems)) {
          const loadedItems = savedItems.map((item: any) => ({
            ...item,
            id: Math.random().toString(36).substring(7),
            previewUrl: URL.createObjectURL(item.file),
            isLoaded: false
          }));
          setItems(loadedItems);
        }
      } catch (err) {
        console.error('Failed to load saved data:', err);
      }
    };
    loadSavedData();
  }, []);

  const handleFiles = async (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => 
      file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.eps')
    );
    
    if (validFiles.length === 0) {
      setError('Harap upload file gambar (JPG, PNG, WEBP, EPS).');
      return;
    }

    setError('');
    
    const newItems: FileItem[] = validFiles.map(file => {
      const isEps = file.name.toLowerCase().endsWith('.eps');
      return {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: isEps ? '' : URL.createObjectURL(file),
        status: 'pending',
        isLoaded: false,
        isConverting: isEps
      };
    });

    const updatedItems = [...items, ...newItems];
    setItems(updatedItems);
    
    // Process EPS files sequentially
    (async () => {
      for (const item of newItems) {
        if (item.isConverting) {
          try {
            const formData = new FormData();
            formData.append('file', item.file);
            
            const response = await fetch('/api/convert-eps', {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) {
              throw new Error('Failed to convert EPS');
            }
            
            const data = await response.json();
            
            setItems(prev => prev.map(p => 
              p.id === item.id 
                ? { ...p, previewUrl: data.image, convertedBase64: data.base64, isConverting: false } 
                : p
            ));
          } catch (err) {
            console.error('Error converting EPS:', err);
            setItems(prev => prev.map(p => 
              p.id === item.id 
                ? { ...p, status: 'error', error: 'Gagal mengonversi file EPS untuk preview', isConverting: false } 
                : p
            ));
          }
        }
      }
    })();

    try {
      await set('highlogo_items', updatedItems.map(item => ({
        file: item.file,
        metadata: item.metadata,
        status: item.status,
        error: item.error
      })));
    } catch (err) {
      console.error('Failed to save items:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleGenerate = async () => {
    if (items.length === 0) return;
    
    if (items.some(item => item.isConverting)) {
      setError('Harap tunggu hingga semua file EPS selesai dikonversi.');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);

    let currentItems = [...items];
    const itemsToProcess = currentItems.filter(i => i.status !== 'success');
    const totalItems = itemsToProcess.length;
    let completedItems = 0;

    const CONCURRENCY = 10;
    let currentIndex = 0;

    const processNext = async (): Promise<void> => {
      if (currentIndex >= currentItems.length) return;
      
      const i = currentIndex++;
      const item = currentItems[i];
      
      if (item.status === 'success') {
        return processNext();
      }

      setItems(prev => {
        const newItems = [...prev];
        newItems[i].status = 'generating';
        return newItems;
      });

      try {
        let base64Data: string;
        let mimeType: string;

        if (item.convertedBase64) {
          base64Data = item.convertedBase64;
          mimeType = 'image/png';
        } else if (item.file.name.toLowerCase().endsWith('.eps')) {
          setItems(prev => {
            const newItems = [...prev];
            newItems[i].isConverting = true;
            return newItems;
          });
          
          const formData = new FormData();
          formData.append('file', item.file);
          
          const response = await fetch('/api/convert-eps', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error('Failed to convert EPS');
          }
          
          const data = await response.json();
          
          setItems(prev => {
            const newItems = [...prev];
            newItems[i].previewUrl = data.image;
            newItems[i].convertedBase64 = data.base64;
            newItems[i].isConverting = false;
            return newItems;
          });
          
          base64Data = data.base64;
          mimeType = 'image/png';
        } else {
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(item.file);
          });
          mimeType = item.file.type;
        }

        const result = await generateHighLogoMetadata(base64Data, mimeType);
        
        setItems(prev => {
          const newItems = [...prev];
          if (result) {
            newItems[i].metadata = result;
            newItems[i].status = 'success';
            newItems[i].isExpanded = true;
          } else {
            newItems[i].status = 'error';
            newItems[i].error = 'Gagal menghasilkan metadata.';
          }
          return newItems;
        });
      } catch (err: any) {
        console.error(err);
        setItems(prev => {
          const newItems = [...prev];
          newItems[i].status = 'error';
          newItems[i].error = err.message || 'Terjadi kesalahan saat menghubungi AI.';
          return newItems;
        });
      }

      completedItems++;
      setProgress(Math.round((completedItems / totalItems) * 100));
      
      try {
        setItems(latestItems => {
          set('highlogo_items', latestItems.map(item => ({
            file: item.file,
            metadata: item.metadata,
            status: item.status,
            error: item.error
          }))).catch(err => console.error('Failed to save progress:', err));
          return latestItems;
        });
      } catch (err) {
        console.error('Failed to save progress:', err);
      }

      await processNext();
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, currentItems.length); i++) {
      workers.push(processNext());
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await Promise.all(workers);
    setLoading(false);
  };

  const handleCopy = (text: string, fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCopyTag = (text: string, fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedTags(prev => ({ ...prev, [fieldId]: true }));
  };

  const toggleExpand = (id: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, isExpanded: !item.isExpanded } : item
    ));
  };

  const handleRemove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    
    try {
      await set('highlogo_items', newItems.map(item => ({
        file: item.file,
        metadata: item.metadata,
        status: item.status,
        error: item.error
      })));
    } catch (err) {
      console.error('Failed to update storage after removal:', err);
    }
  };

  const handleClearAll = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
      return;
    }
    
    setItems([]);
    setShowClearConfirm(false);
    try {
      await del('highlogo_items');
    } catch (err) {
      console.error('Failed to clear storage:', err);
    }
  };

  const handleRegenerate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemIndex = items.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const item = items[itemIndex];
    
    setItems(prev => prev.map(p => 
      p.id === id ? { ...p, status: 'generating', error: undefined } : p
    ));

    try {
      let base64Data: string;
      let mimeType: string;

      if (item.convertedBase64) {
        base64Data = item.convertedBase64;
        mimeType = 'image/png';
      } else if (item.file.name.toLowerCase().endsWith('.eps')) {
        setItems(prev => prev.map(p => 
          p.id === id ? { ...p, isConverting: true } : p
        ));
        
        const formData = new FormData();
        formData.append('file', item.file);
        
        const response = await fetch('/api/convert-eps', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error('Failed to convert EPS');
        }
        
        const data = await response.json();
        
        setItems(prev => prev.map(p => 
          p.id === id 
            ? { ...p, previewUrl: data.image, convertedBase64: data.base64, isConverting: false } 
            : p
        ));
        
        base64Data = data.base64;
        mimeType = 'image/png';
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(item.file);
        });
        mimeType = item.file.type;
      }

      const result = await generateHighLogoMetadata(base64Data, mimeType);
      
      if (result) {
        setItems(prev => prev.map(p => 
          p.id === id 
            ? { ...p, metadata: result, status: 'success', isExpanded: true } 
            : p
        ));
      } else {
        setItems(prev => prev.map(p => 
          p.id === id 
            ? { ...p, status: 'error', error: 'Gagal menghasilkan metadata.' } 
            : p
        ));
      }
    } catch (err: any) {
      console.error(err);
      setItems(prev => prev.map(p => 
        p.id === id 
          ? { ...p, status: 'error', error: err.message || 'Terjadi kesalahan saat menghubungi AI.' } 
          : p
      ));
    }

    try {
      setItems(latestItems => {
        set('highlogo_items', latestItems.map(item => ({
          file: item.file,
          metadata: item.metadata,
          status: item.status,
          error: item.error
        }))).catch(err => console.error('Failed to save progress:', err));
        return latestItems;
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  };

  const escapeCSV = (str: string) => {
    if (!str) return '""';
    return `"${str.replace(/"/g, '""')}"`;
  };

  const downloadCSV = (content: string, filename: string) => {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCSV = () => {
    const header = "Filename,Title,Category,Description,Tags,Price\n";
    const rows = items
      .filter(item => item.status === 'success' && item.metadata)
      .map(item => {
        const m = item.metadata!;
        const cleanTitle = m.title.replace(/[\r\n]+/g, ' ').trim();
        const cleanDesc = m.description.replace(/[\r\n]+/g, ' ').trim();
        return `${escapeCSV(item.file.name)},${escapeCSV(cleanTitle)},${escapeCSV(m.category)},${escapeCSV(cleanDesc)},${escapeCSV(m.tags.join(', '))},${m.price}`;
      })
      .join('\n');
    downloadCSV(header + rows, 'highlogo_metadata.csv');
  };

  const isAnyMediaLoading = items.some(i => !i.isLoaded && !i.isConverting);
  const isAllSuccess = items.length > 0 && items.every(i => i.status === 'success');
  const isWaitingForRateLimit = loading && rateLimitState.isRateLimited;
  const isGenerateDisabled = loading || items.length === 0 || isAnyMediaLoading || isAllSuccess;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            High Logo Metadata Generator
          </h2>
          <p className="text-slate-600 text-lg">
            Upload logo Anda (JPG, PNG, WEBP, EPS) dan biarkan AI membuatkan metadata yang dioptimalkan untuk HighLogo.com.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div 
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                items.length > 0 ? 'border-slate-200 bg-slate-50' : 'border-primary-300 bg-primary-50 hover:bg-primary-100 cursor-pointer'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => items.length === 0 && fileInputRef.current?.click()}
            >
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp,.eps"
              />
              <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                <Upload className="w-8 h-8 text-primary-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Upload Logo</h3>
              <p className="text-slate-500 text-sm mb-4">
                Drag & drop file Anda di sini, atau klik untuk memilih file.
              </p>
              {items.length > 0 && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Tambah File Lain
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {items.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Status</h3>
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                    {items.length} File
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Berhasil:</span>
                  <span className="font-bold text-emerald-600">{successCount}</span>
                </div>
                
                {loading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Progres:</span>
                      <span className="font-bold text-primary-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-primary-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    
                    {isWaitingForRateLimit && (
                      <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mt-2 bg-amber-50 p-2 rounded border border-amber-100">
                        <Clock className="w-3 h-3 animate-pulse" />
                        <span>Menunggu limit API Google (1 menit)...</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-2">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerateDisabled}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memproses...
                      </>
                    ) : isAllSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        Selesai
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Metadata
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleClearAll}
                    disabled={loading}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      showClearConfirm 
                        ? 'bg-red-600 hover:bg-red-700 text-white border border-red-600' 
                        : 'bg-white hover:bg-red-50 text-red-600 border border-red-200'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {showClearConfirm ? 'Yakin Hapus Semua?' : 'Hapus Semua'}
                  </button>
                </div>

                {successCount > 0 && (
                  <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                    <button onClick={handleDownloadCSV} className="flex-1 py-3 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-primary-200">
                      <Download className="w-4 h-4" />
                      Download CSV
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {items.length === 0 && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-8 text-center">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>Metadata akan muncul di sini setelah Anda mengupload logo dan menekan tombol Generate.</p>
              </div>
            )}

            <AnimatePresence>
              {items.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                >
                  <div 
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200 relative flex items-center justify-center">
                      {item.isConverting ? (
                        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50">
                          <Loader2 className="w-5 h-5 text-primary-500 animate-spin mb-1" />
                          <span className="text-[10px] text-slate-500 font-medium">EPS</span>
                        </div>
                      ) : item.previewUrl ? (
                        <img 
                          src={item.previewUrl} 
                          alt={item.file.name} 
                          className="w-full h-full object-cover"
                          onLoad={() => {
                            setItems(prev => prev.map(p => p.id === item.id ? { ...p, isLoaded: true } : p));
                          }}
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate" title={item.file.name}>
                        {item.file.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {item.status === 'pending' && <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Menunggu</span>}
                        {item.status === 'generating' && <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Memproses</span>}
                        {item.status === 'success' && <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1"><Check className="w-3 h-3" /> Selesai</span>}
                        {item.status === 'error' && <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Gagal</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status === 'error' && (
                        <button 
                          onClick={(e) => handleRegenerate(item.id, e)}
                          className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Coba Lagi"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => handleRemove(item.id, e)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      {item.isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </div>

                  {item.isExpanded && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50">
                      {item.status === 'error' && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 mb-4">
                          {item.error}
                        </div>
                      )}

                      {item.metadata && (
                        <div className="space-y-6">
                          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <h5 className="font-bold text-slate-900 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                                High Logo Metadata
                              </h5>
                            </div>
                            
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title (Max 55 chars)</label>
                                  <button 
                                    onClick={(e) => handleCopy(item.metadata!.title, `${item.id}-title`, e)}
                                    className="text-primary-600 hover:text-primary-700 text-xs font-medium flex items-center gap-1"
                                  >
                                    {copiedField === `${item.id}-title` ? <><Check className="w-3 h-3" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
                                  </button>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium">
                                  {item.metadata.title}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</label>
                                  <button 
                                    onClick={(e) => handleCopy(item.metadata!.category, `${item.id}-category`, e)}
                                    className="text-primary-600 hover:text-primary-700 text-xs font-medium flex items-center gap-1"
                                  >
                                    {copiedField === `${item.id}-category` ? <><Check className="w-3 h-3" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
                                  </button>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800">
                                  {item.metadata.category}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description (400-600 chars)</label>
                                  <button 
                                    onClick={(e) => handleCopy(item.metadata!.description, `${item.id}-desc`, e)}
                                    className="text-primary-600 hover:text-primary-700 text-xs font-medium flex items-center gap-1"
                                  >
                                    {copiedField === `${item.id}-desc` ? <><Check className="w-3 h-3" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
                                  </button>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap">
                                  {item.metadata.description}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags (10 tags)</label>
                                  <button 
                                    onClick={(e) => handleCopy(item.metadata!.tags.join(', '), `${item.id}-tags-all`, e)}
                                    className="text-primary-600 hover:text-primary-700 text-xs font-medium flex items-center gap-1"
                                  >
                                    {copiedField === `${item.id}-tags-all` ? <><Check className="w-3 h-3" /> Semua Tersalin</> : <><Copy className="w-3 h-3" /> Salin Semua</>}
                                  </button>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap gap-2">
                                  {item.metadata.tags.map((tag, idx) => {
                                    const tagId = `${item.id}-tag-${idx}`;
                                    const isCopied = copiedTags[tagId];
                                    return (
                                      <button
                                        key={idx}
                                        onClick={(e) => handleCopyTag(tag, tagId, e)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm transition-colors ${isCopied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 hover:border-primary-300 hover:bg-primary-50 text-slate-700'}`}
                                        title="Klik untuk menyalin tag ini"
                                      >
                                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                                        {tag}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Price (USD)</label>
                                  <button 
                                    onClick={(e) => handleCopy(item.metadata!.price.toString(), `${item.id}-price`, e)}
                                    className="text-primary-600 hover:text-primary-700 text-xs font-medium flex items-center gap-1"
                                  >
                                    {copiedField === `${item.id}-price` ? <><Check className="w-3 h-3" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
                                  </button>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-bold text-emerald-600">
                                  ${item.metadata.price}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}
