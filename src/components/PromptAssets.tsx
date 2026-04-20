import React, { useState } from 'react';
import { Sparkles, Copy, Check, FileText, Loader2, AlertCircle, Image as ImageIcon, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generatePrompts } from '../services/geminiService';

export default function PromptAssets() {
  const [keyword, setKeyword] = useState('');
  const [count, setCount] = useState<number>(5);
  const [platform, setPlatform] = useState<'Adobe Stock' | 'Shutterstock'>('Adobe Stock');
  const [assetType, setAssetType] = useState<'Image' | 'Video'>('Image');
  const [loading, setLoading] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || count < 1 || count > 100) return;

    setLoading(true);
    setError('');
    setPrompts([]);

    try {
      const data = await generatePrompts(keyword, count, platform, assetType);
      setPrompts(data);
    } catch (err) {
      setError('Gagal menghasilkan prompt. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySingle = (prompt: string, index: number) => {
    navigator.clipboard.writeText(prompt);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    if (prompts.length === 0) return;
    const allPrompts = prompts.join('\n');
    navigator.clipboard.writeText(allPrompts);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (prompts.length === 0) return;
    const content = prompts.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompts-${keyword.replace(/\s+/g, '-')}-${assetType.toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl mb-4">
            <Sparkles className="w-6 h-6 text-purple-600" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            AI Prompt Generator
          </h2>
          <p className="text-slate-600 text-lg">
            Buat prompt spesifik dan detail untuk AI Image/Video Generator (Midjourney, Sora, dll) berdasarkan tren Microstock saat ini.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="max-w-3xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Keyword Target</label>
              <input
                type="text"
                placeholder="Contoh: cyberpunk city, minimalist interior"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                required
              />
            </div>
            <div className="w-full md:w-32">
              <label className="block text-sm font-medium text-slate-700 mb-2">Jumlah</label>
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tipe Aset</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssetType('Image')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                    assetType === 'Image'
                      ? 'bg-purple-50 text-purple-700 border-2 border-purple-500'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" /> Image
                </button>
                <button
                  type="button"
                  onClick={() => setAssetType('Video')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                    assetType === 'Video'
                      ? 'bg-purple-50 text-purple-700 border-2 border-purple-500'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Video className="w-4 h-4" /> Video
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Platform Target</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPlatform('Adobe Stock')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                    platform === 'Adobe Stock'
                      ? 'bg-slate-800 text-white border-2 border-slate-800'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Adobe Stock
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform('Shutterstock')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                    platform === 'Shutterstock'
                      ? 'bg-slate-800 text-white border-2 border-slate-800'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Shutterstock
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed w-full md:w-auto justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Meracik Prompt...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate {count} Prompts
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 mb-8">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {prompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Hasil Generate Prompts
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">
                    {prompts.length} {assetType}s
                  </span>
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Dioptimalkan untuk {platform} berdasarkan tren saat ini.
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handleCopyAll}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  {copiedAll ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  Salin Semua
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Download .txt
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {prompts.map((prompt, index) => (
                <div key={index} className="p-6 hover:bg-slate-50 transition-colors group relative">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 pr-12">
                      <p className="text-slate-800 leading-relaxed font-medium">{prompt}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopySingle(prompt, index)}
                    className="absolute top-6 right-6 p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Salin prompt ini"
                  >
                    {copiedIndex === index ? (
                      <Check className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
