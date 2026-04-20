import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Loader2, FileText, Copy, Check, AlertCircle, TrendingUp, Trash2, Download, ChevronDown, ChevronUp, RefreshCw, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateAssetMetadata, AssetMetadata } from '../services/geminiService';
import { getRateLimitState, subscribeToRateLimit, RateLimitState } from '../services/rateLimitService';
import { set, get, del } from 'idb-keyval';

export interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  metadata?: AssetMetadata;
  status: 'pending' | 'generating' | 'success' | 'error';
  error?: string;
  isExpanded?: boolean;
  isLoaded?: boolean;
  isConverting?: boolean;
  convertedBase64?: string;
}

const ADOBE_CATEGORIES: Record<string, string> = {
  "Animals": "1",
  "Buildings and Architecture": "2",
  "Business": "3",
  "Drinks": "4",
  "Environment": "5",
  "States of Mind": "6",
  "Food": "7",
  "Graphic Resources": "8",
  "Hobbies and Leisure": "9",
  "Industry": "10",
  "Landscapes": "11",
  "Lifestyle": "12",
  "People": "13",
  "Plants and Flowers": "14",
  "Culture and Religion": "15",
  "Science": "16",
  "Social Issues": "17",
  "Sports": "18",
  "Technology": "19",
  "Transport": "20",
  "Travel": "21"
};

export default function MetadataGenerator() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
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
        const savedItems = await get('metadata_items');
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
      file.type.startsWith('image/') || file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.eps')
    );
    
    if (validFiles.length === 0) {
      setError('Harap upload file gambar (JPG, PNG, WEBP, EPS) atau video (MP4).');
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
    
    // Process EPS files sequentially to avoid overloading the server
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
      await set('metadata_items', updatedItems.map(item => ({
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

    // Process with concurrency limit and staggered starts to avoid burst limits
    const CONCURRENCY = 10;
    let currentIndex = 0;

    const processNext = async (): Promise<void> => {
      if (currentIndex >= currentItems.length) return;
      
      const i = currentIndex++;
      const item = currentItems[i];
      
      if (item.status === 'success') {
        return processNext();
      }

      // Update status to generating
      setItems(prev => {
        const newItems = [...prev];
        newItems[i].status = 'generating';
        return newItems;
      });

      try {
        let base64Data: string;
        let mimeType: string;

        if (item.convertedBase64) {
          base64Data = item.convertedBase64!;
          mimeType = 'image/png';
        } else if (item.file.name.toLowerCase().endsWith('.eps')) {
          // Retry conversion for EPS
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

        const result = await generateAssetMetadata(base64Data, mimeType, selectedPlatforms);
        
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
      
      // Save progress after each item
      try {
        setItems(latestItems => {
          set('metadata_items', latestItems.map(item => ({
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

      // Process next item
      await processNext();
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, currentItems.length); i++) {
      workers.push(processNext());
      // Add a small delay between starting workers to avoid burst limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await Promise.all(workers);

    setLoading(false);
    setShowSuccessPopup(true);
    setTimeout(() => setShowSuccessPopup(false), 1000);
  };

  const handleRetry = async (id: string) => {
    const itemIndex = items.findIndex(i => i.id === id);
    if (itemIndex === -1) return;
    
    if (items[itemIndex].isConverting) {
      setError('Harap tunggu hingga file EPS selesai dikonversi.');
      return;
    }

    let currentItems = [...items];
    
    // If it's an EPS file that failed conversion, retry conversion first
    if (currentItems[itemIndex].file.name.toLowerCase().endsWith('.eps') && !currentItems[itemIndex].convertedBase64) {
      currentItems[itemIndex].isConverting = true;
      currentItems[itemIndex].status = 'pending';
      currentItems[itemIndex].error = undefined;
      setItems([...currentItems]);
      
      try {
        const formData = new FormData();
        formData.append('file', currentItems[itemIndex].file);
        
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
            ? { ...p, previewUrl: data.image, convertedBase64: data.base64, isConverting: false, status: 'generating' } 
            : p
        ));
        
        // After successful conversion, proceed to generate metadata
        try {
          const result = await generateAssetMetadata(data.base64, 'image/png', targetPlatform);
          
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
      } catch (err) {
        console.error('Error converting EPS:', err);
        setItems(prev => prev.map(p => 
          p.id === id 
            ? { ...p, status: 'error', error: 'Gagal mengonversi file EPS untuk preview', isConverting: false } 
            : p
        ));
      }
      return;
    }

    currentItems[itemIndex].status = 'generating';
    currentItems[itemIndex].error = undefined;
    setItems([...currentItems]);

    try {
      let base64Data: string;
      let mimeType: string;

      if (currentItems[itemIndex].convertedBase64) {
        base64Data = currentItems[itemIndex].convertedBase64!;
        mimeType = 'image/png';
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(currentItems[itemIndex].file);
        });
        mimeType = currentItems[itemIndex].file.type;
      }

      const result = await generateAssetMetadata(base64Data, mimeType, targetPlatform);
      
      if (result) {
        currentItems[itemIndex].metadata = result;
        currentItems[itemIndex].status = 'success';
        currentItems[itemIndex].isExpanded = true;
      } else {
        currentItems[itemIndex].status = 'error';
        currentItems[itemIndex].error = 'Gagal menghasilkan metadata.';
      }
    } catch (err: any) {
      console.error(err);
      currentItems[itemIndex].status = 'error';
      currentItems[itemIndex].error = err.message || 'Terjadi kesalahan saat menghubungi AI.';
    }

    setItems([...currentItems]);
    
    try {
      await set('metadata_items', currentItems.map(item => ({
        file: item.file,
        metadata: item.metadata,
        status: item.status,
        error: item.error
      })));
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  };

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClear = async () => {
    items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setError('');
    
    try {
      await del('metadata_items');
      await del('metadata_file');
      await del('metadata_result');
    } catch (err) {
      console.error('Failed to clear saved data:', err);
      setError('Gagal menghapus data tersimpan.');
    }
  };

  const handleMediaLoaded = (id: string) => {
    setItems(prevItems => prevItems.map(item => 
      item.id === id ? { ...item, isLoaded: true } : item
    ));
  };

  const toggleExpand = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, isExpanded: !item.isExpanded } : item));
  };

  const removeFile = async (id: string) => {
    const itemToRemove = items.find(i => i.id === id);
    if (itemToRemove) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    if (newItems.length === 0) {
      await del('metadata_items');
    } else {
      await set('metadata_items', newItems.map(item => ({
        file: item.file,
        metadata: item.metadata,
        status: item.status,
        error: item.error
      })));
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
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAdobeCSV = () => {
    const header = "Filename,Title,Keywords,Category,Releases\n";
    const rows = items
      .filter(item => item.status === 'success' && item.metadata?.adobeStock)
      .map(item => {
        const m = item.metadata!.adobeStock!;
        const cleanTitle = m.title.replace(/[\r\n]+/g, ' ').trim();
        const categoryId = ADOBE_CATEGORIES[m.category] || m.category;
        return `${escapeCSV(item.file.name)},${escapeCSV(cleanTitle)},${escapeCSV(m.keywords.join(', '))},${escapeCSV(categoryId)},`;
      })
      .join('\n');
    downloadCSV(header + rows, 'adobe_stock_metadata.csv');
  };

  const handleDownloadShutterstockCSV = () => {
    const header = "Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial\n";
    const rows = items
      .filter(item => item.status === 'success' && item.metadata?.shutterstock)
      .map(item => {
        const m = item.metadata!.shutterstock!;
        const cleanDesc = m.description.replace(/[\r\n]+/g, ' ').trim();
        
        // Filter common banned keywords and limit to 50
        const bannedWords = ['editable stroke', 'vector', 'eps', 'svg', 'shutterstock', 'stock', 'image', 'photo', 'picture'];
        const cleanKeywords = m.keywords
          .map(k => k.trim())
          .filter(k => k.length > 0 && !bannedWords.includes(k.toLowerCase()))
          .slice(0, 50);
          
        const categoryIds = m.categories.join(',');

        return `${escapeCSV(item.file.name)},${escapeCSV(cleanDesc)},${escapeCSV(cleanKeywords.join(','))},${escapeCSV(categoryIds)},${m.isIllustration ? 'Yes' : 'No'},No,No`;
      })
      .join('\n');
    downloadCSV(header + rows, 'shutterstock_metadata.csv');
  };

  const handleDownload123rfCSV = () => {
    const header = '"oldfilename","123rf_filename","description","keywords","country"\n';
    const rows = items
      .filter(item => item.status === 'success' && item.metadata?.['123rf'])
      .map(item => {
        const m = item.metadata!['123rf']!;
        const cleanDesc = m.description.replace(/[\r\n]+/g, ' ').trim();
        const cleanKeywords = m.keywords.map(k => k.trim()).filter(k => k.length > 0).slice(0, 50);

        return `${escapeCSV(item.file.name)},"",${escapeCSV(cleanDesc)},${escapeCSV(cleanKeywords.join(','))},${escapeCSV(m.country)}`;
      })
      .join('\n');
    downloadCSV(header + rows, '123rf_metadata.csv');
  };

  const hasAdobeSuccess = items.some(item => item.status === 'success' && item.metadata?.adobeStock);
  const hasShutterstockSuccess = items.some(item => item.status === 'success' && item.metadata?.shutterstock);
  const hasDreamstimeSuccess = items.some(item => item.status === 'success' && item.metadata?.dreamstime);
  const has123rfSuccess = items.some(item => item.status === 'success' && item.metadata?.['123rf']);

  const isAnyMediaLoading = items.some(i => !i.isLoaded);
  const isAllSuccess = items.length > 0 && items.every(i => i.status === 'success');
  const isWaitingForRateLimit = loading && rateLimitState.isRateLimited;
  const isGenerateDisabled = loading || items.length === 0 || isAnyMediaLoading || isAllSuccess || selectedPlatforms.length === 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            AI Metadata Generator
          </h2>
          <p className="text-slate-600 text-lg mb-4">
            Upload aset Anda dan biarkan AI membuatkan judul, deskripsi, kategori, dan kata kunci yang dioptimalkan untuk Adobe Stock, Shutterstock, Dreamstime, dan 123rf.
          </p>
        </div>

        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          {/* Upload Section */}
          <div className="flex flex-col gap-4">
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                items.length > 0 ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-400 bg-slate-50'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,video/mp4,.eps" 
                multiple
                className="hidden" 
              />
              
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-700 font-medium mb-1">Klik atau drag & drop beberapa file ke sini</p>
                <p className="text-slate-500 text-sm">Mendukung format JPG, PNG, WEBP, MP4, EPS</p>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 text-rose-700 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {items.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    File Terunggah 
                    <span className="bg-primary-50 text-primary-700 py-1 px-3 rounded-full text-sm font-bold">
                      {items.length} file
                    </span>
                    {successCount > 0 && (
                      <span className="bg-emerald-50 text-emerald-700 py-1 px-3 rounded-full text-sm font-bold flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        {successCount} Berhasil
                      </span>
                    )}
                  </h3>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-slate-700">Pilih Platform Target:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      onClick={() => {
                        setSelectedPlatforms(prev => 
                          prev.includes('adobe') ? prev.filter(p => p !== 'adobe') : [...prev, 'adobe']
                        );
                      }}
                      className={`py-3 px-4 rounded-xl border font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        selectedPlatforms.includes('adobe')
                          ? 'bg-red-50 border-red-500 text-red-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlatforms.includes('adobe') ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300'}`}>
                        {selectedPlatforms.includes('adobe') && <Check className="w-3 h-3" />}
                      </span>
                      Adobe Stock
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlatforms(prev => 
                          prev.includes('shutterstock') ? prev.filter(p => p !== 'shutterstock') : [...prev, 'shutterstock']
                        );
                      }}
                      className={`py-3 px-4 rounded-xl border font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        selectedPlatforms.includes('shutterstock')
                          ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlatforms.includes('shutterstock') ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300'}`}>
                        {selectedPlatforms.includes('shutterstock') && <Check className="w-3 h-3" />}
                      </span>
                      Shutterstock
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlatforms(prev => 
                          prev.includes('dreamstime') ? prev.filter(p => p !== 'dreamstime') : [...prev, 'dreamstime']
                        );
                      }}
                      className={`py-3 px-4 rounded-xl border font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        selectedPlatforms.includes('dreamstime')
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlatforms.includes('dreamstime') ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                        {selectedPlatforms.includes('dreamstime') && <Check className="w-3 h-3" />}
                      </span>
                      Dreamstime
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlatforms(prev => 
                          prev.includes('123rf') ? prev.filter(p => p !== '123rf') : [...prev, '123rf']
                        );
                      }}
                      className={`py-3 px-4 rounded-xl border font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        selectedPlatforms.includes('123rf')
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlatforms.includes('123rf') ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300'}`}>
                        {selectedPlatforms.includes('123rf') && <Check className="w-3 h-3" />}
                      </span>
                      123rf
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerateDisabled}
                      className="flex-1 py-4 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow relative overflow-hidden"
                    >
                      {loading && (
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-primary-500/30 transition-all duration-300" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      )}
                      <div className="relative z-10 flex items-center gap-2">
                        {isWaitingForRateLimit ? (
                          <>
                            <Clock className="w-5 h-5 animate-pulse" />
                            Menunggu Limit API...
                          </>
                        ) : isAnyMediaLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Menyiapkan File...
                          </>
                        ) : loading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Menganalisa Gambar... {progress}%
                          </>
                        ) : (
                          <>
                            <FileText className="w-5 h-5" />
                            Generate Metadata
                          </>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={handleClear}
                      disabled={loading}
                      className="px-6 py-4 bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2 border border-rose-200 disabled:border-slate-200 shadow-sm hover:shadow"
                      title="Hapus semua file dan metadata"
                    >
                      <Trash2 className="w-5 h-5" />
                      Clear All
                    </button>
                  </div>
                  
                  {loading && (
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-primary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                  )}
                </div>

                {(hasAdobeSuccess || hasShutterstockSuccess || has123rfSuccess) && (
                  <div className="flex gap-4 pt-4 border-t border-slate-100 flex-wrap">
                    {hasAdobeSuccess && (
                      <button onClick={handleDownloadAdobeCSV} className="flex-1 min-w-[200px] py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-red-200">
                        <Download className="w-4 h-4" />
                        Download CSV Adobe Stock
                      </button>
                    )}
                    {hasShutterstockSuccess && (
                      <button onClick={handleDownloadShutterstockCSV} className="flex-1 min-w-[200px] py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-rose-200">
                        <Download className="w-4 h-4" />
                        Download CSV Shutterstock
                      </button>
                    )}
                    {has123rfSuccess && (
                      <button onClick={handleDownload123rfCSV} className="flex-1 min-w-[200px] py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-blue-200">
                        <Download className="w-4 h-4" />
                        Download CSV 123rf
                      </button>
                    )}
                    {((hasAdobeSuccess ? 1 : 0) + (hasShutterstockSuccess ? 1 : 0) + (has123rfSuccess ? 1 : 0)) > 1 && (
                      <button 
                        onClick={() => {
                          if (hasAdobeSuccess) handleDownloadAdobeCSV();
                          if (hasShutterstockSuccess) setTimeout(handleDownloadShutterstockCSV, 500);
                          if (has123rfSuccess) setTimeout(handleDownload123rfCSV, 1000);
                        }} 
                        className="flex-1 min-w-[200px] py-3 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-primary-200"
                      >
                        <Download className="w-4 h-4" />
                        Download Semua CSV
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="flex flex-col gap-4">
            {items.length === 0 && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-8 text-center">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>Metadata akan muncul di sini setelah Anda mengupload gambar dan menekan tombol Generate.</p>
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
                  {/* Item Header */}
                  <div className="flex flex-col sm:flex-row items-start p-4 gap-4 bg-slate-50 border-b border-slate-100">
                    <div className="w-full sm:w-48 h-48 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200 relative flex items-center justify-center">
                      {(!item.isLoaded && item.status !== 'error') && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
                          {item.isConverting ? (
                            <>
                              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-2" />
                              <span className="text-xs text-slate-500 font-medium">Mengonversi EPS...</span>
                            </>
                          ) : (
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                          )}
                        </div>
                      )}
                      {item.status === 'error' && !item.previewUrl && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10">
                          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                          <span className="text-xs text-red-500 font-medium text-center px-2">Gagal memuat preview</span>
                        </div>
                      )}
                      {item.file.type.startsWith('video/') ? (
                        item.previewUrl && (
                          <video 
                            src={item.previewUrl} 
                            className={`w-full h-full object-contain transition-opacity duration-300 ${item.isLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoadedData={() => handleMediaLoaded(item.id)}
                          />
                        )
                      ) : (
                        item.previewUrl && (
                          <img 
                            src={item.previewUrl} 
                            alt="Preview" 
                            className={`w-full h-full object-contain transition-opacity duration-300 ${item.isLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={() => handleMediaLoaded(item.id)}
                          />
                        )
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0 w-full flex flex-col justify-between h-full sm:h-48 py-1">
                      <div className="flex flex-col gap-1">
                        <p className="font-semibold text-slate-800 truncate" title={item.file.name}>{item.file.name}</p>
                        <p className="text-xs text-slate-500">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4 sm:mt-auto">
                        {/* Status Badge */}
                        <div className="shrink-0">
                          {item.status === 'pending' && <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Pending</span>}
                          {item.status === 'generating' && (
                            <span className="px-3 py-1 bg-primary-50 text-primary-600 rounded-full text-xs font-medium flex items-center gap-1">
                              {isWaitingForRateLimit ? (
                                <>
                                  <Clock className="w-3 h-3 animate-pulse"/> Menunggu Limit
                                </>
                              ) : (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin"/> Generating
                                </>
                              )}
                            </span>
                          )}
                          {item.status === 'success' && <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Success</span>}
                          {item.status === 'error' && <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-medium flex items-center gap-1" title={item.error}><AlertCircle className="w-3 h-3"/> Error</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === 'error' && (
                            <button onClick={() => handleRetry(item.id)} className="p-2 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors" title="Coba Lagi">
                              <RefreshCw className="w-5 h-5" />
                            </button>
                          )}
                          {item.status === 'success' && (
                            <button onClick={() => toggleExpand(item.id)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                              {item.isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          )}
                          <button onClick={() => removeFile(item.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" disabled={item.status === 'generating'}>
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {item.isExpanded && item.metadata && (
                    <div className="p-6 bg-white">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Adobe Stock */}
                        {selectedPlatforms.includes('adobe') && item.metadata.adobeStock && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                Adobe Stock
                              </h3>
                              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                <TrendingUp className="w-3 h-3" />
                                {item.metadata.adobeStock.trendingProbability}%
                              </div>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.adobeStock!.title, `adobe-title-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Title"
                                  >
                                    {copiedField === `adobe-title-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{item.metadata.adobeStock.title}</p>
                              </div>
                              
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category</label>
                                <span className="inline-block bg-primary-50 text-primary-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-primary-100">
                                  {item.metadata.adobeStock.category}
                                </span>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Keywords ({item.metadata.adobeStock.keywords.length})</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.adobeStock!.keywords.join(', '), `adobe-keywords-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Keywords"
                                  >
                                    {copiedField === `adobe-keywords-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.metadata.adobeStock.keywords.map((kw, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Shutterstock */}
                        {selectedPlatforms.includes('shutterstock') && item.metadata.shutterstock && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                                Shutterstock
                              </h3>
                              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                <TrendingUp className="w-3 h-3" />
                                {item.metadata.shutterstock.trendingProbability}%
                              </div>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.shutterstock!.description, `shutter-title-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Description"
                                  >
                                    {copiedField === `shutter-title-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{item.metadata.shutterstock.description}</p>
                              </div>
                              
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Categories</label>
                                <div className="flex gap-2">
                                  {item.metadata.shutterstock.categories.map((cat, i) => (
                                    <span key={i} className="inline-block bg-primary-50 text-primary-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-primary-100">
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Keywords ({item.metadata.shutterstock.keywords.length})</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.shutterstock!.keywords.join(', '), `shutter-keywords-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Keywords"
                                  >
                                    {copiedField === `shutter-keywords-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.metadata.shutterstock.keywords.map((kw, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Dreamstime */}
                        {selectedPlatforms.includes('dreamstime') && item.metadata.dreamstime && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                Dreamstime
                              </h3>
                              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                <TrendingUp className="w-3 h-3" />
                                {item.metadata.dreamstime.trendingProbability}%
                              </div>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.dreamstime!.title, `dreamstime-title-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Title"
                                  >
                                    {copiedField === `dreamstime-title-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{item.metadata.dreamstime.title}</p>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.dreamstime!.description, `dreamstime-desc-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Description"
                                  >
                                    {copiedField === `dreamstime-desc-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{item.metadata.dreamstime.description}</p>
                              </div>
                              
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Categories</label>
                                <div className="flex gap-2">
                                  {item.metadata.dreamstime.categories.map((cat, i) => (
                                    <span key={i} className="inline-block bg-primary-50 text-primary-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-primary-100">
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Keywords ({item.metadata.dreamstime.keywords.length})</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!.dreamstime!.keywords.join(', '), `dreamstime-keywords-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Keywords"
                                  >
                                    {copiedField === `dreamstime-keywords-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.metadata.dreamstime.keywords.map((kw, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 123rf */}
                        {selectedPlatforms.includes('123rf') && item.metadata['123rf'] && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                                123rf
                              </h3>
                              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
                                <TrendingUp className="w-3 h-3" />
                                {item.metadata['123rf'].trendingProbability}%
                              </div>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!['123rf']!.description, `123rf-desc-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Description"
                                  >
                                    {copiedField === `123rf-desc-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">{item.metadata['123rf'].description}</p>
                              </div>
                              
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Country</label>
                                <span className="inline-block bg-primary-50 text-primary-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-primary-100">
                                  {item.metadata['123rf'].country}
                                </span>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Keywords ({item.metadata['123rf'].keywords.length})</label>
                                  <button 
                                    onClick={() => handleCopy(item.metadata!['123rf']!.keywords.join(', '), `123rf-keywords-${item.id}`)}
                                    className="text-slate-400 hover:text-primary-600 transition-colors"
                                    title="Copy Keywords"
                                  >
                                    {copiedField === `123rf-keywords-${item.id}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.metadata['123rf'].keywords.map((kw, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Success Popup */}
      <AnimatePresence>
        {showSuccessPopup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-slate-900/90 backdrop-blur-sm text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
              <div className="bg-emerald-500 rounded-full p-1">
                <Check className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-lg">Metadata berhasil dibuat!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
