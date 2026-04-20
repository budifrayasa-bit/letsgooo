import React, { useState, useMemo } from 'react';
import { Search, TrendingUp, BarChart2, Download, AlertCircle, Loader2, Copy, Check, FileText, ChevronUp, ChevronDown, ListOrdered, Sparkles, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getTrendingKeywords, KeywordData } from './services/geminiService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import RankKeywords from './components/RankKeywords';
import PromptAssets from './components/PromptAssets';
import MetadataGenerator from './components/MetadataGenerator';
import HighLogoGenerator from './components/HighLogoGenerator';

import RateLimitBadge from './components/RateLimitBadge';

type SortKey = 'trendScore' | 'competition' | 'potentialDownloads';
type SortDirection = 'asc' | 'desc';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'riset' | 'rank-keywords' | 'prompt-assets' | 'metadata' | 'high-logo'>('metadata');
  const [niche, setNiche] = useState('');
  const [platform, setPlatform] = useState<'Adobe Stock' | 'Shutterstock'>('Adobe Stock');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KeywordData[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<KeywordData | null>(null);
  const [error, setError] = useState('');
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSelectedKeyword(null);
    setSortConfig(null);

    try {
      const data = await getTrendingKeywords(niche, platform);
      setResults(data);
      if (data.length > 0) {
        setSelectedKeyword(data[0]);
      }
    } catch (err) {
      setError('Gagal mengambil data tren. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(keyword);
    setCopiedKeyword(keyword);
    setTimeout(() => setCopiedKeyword(null), 2000);
  };

  const handleDownloadTxt = () => {
    if (results.length === 0) return;
    
    const content = results.map(r => r.keyword).join(', ');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords-${niche.replace(/\s+/g, '-')}-${platform.replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedResults = useMemo(() => {
    let sortableItems = [...results];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'competition') {
          const compValue = { 'Low': 1, 'Medium': 2, 'High': 3 };
          const aVal = compValue[a.competition];
          const bVal = compValue[b.competition];
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [results, sortConfig]);

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig?.key !== key) return <ChevronDown className="w-4 h-4 text-slate-300 inline-block ml-1" />;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-primary-600 inline-block ml-1" />
      : <ChevronDown className="w-4 h-4 text-primary-600 inline-block ml-1" />;
  };

  const renderCompetitionBars = (comp: 'Low' | 'Medium' | 'High') => {
    const bars = [1, 2, 3];
    const activeCount = comp === 'Low' ? 1 : comp === 'Medium' ? 2 : 3;
    const color = comp === 'Low' ? 'bg-emerald-500' : comp === 'Medium' ? 'bg-amber-500' : 'bg-rose-500';
    
    return (
      <div className="flex items-end gap-1 h-4" title={comp}>
        {bars.map(bar => (
          <div 
            key={bar} 
            className={`w-1.5 rounded-sm ${bar <= activeCount ? color : 'bg-slate-200'}`}
            style={{ height: `${(bar / 3) * 100}%` }}
          />
        ))}
        <span className="ml-2 text-xs font-semibold text-slate-600">{comp}</span>
      </div>
    );
  };

  const chartData = selectedKeyword?.monthlyTrend.map((val, idx) => {
    const months = ['Bulan 1', 'Bulan 2', 'Bulan 3', 'Bulan 4', 'Bulan 5', 'Bulan 6'];
    return { name: months[idx], score: val };
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => setCurrentPage('riset')}
            >
              <img src="https://i.ibb.co.com/BHy58rY5/khopeed.png" alt="khopeed" className="h-10 w-auto" referrerPolicy="no-referrer" />
            </div>
            <RateLimitBadge />
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
            <button 
              onClick={() => setCurrentPage('riset')}
              className={`transition-colors flex items-center gap-1.5 ${currentPage === 'riset' ? 'text-primary-600 font-bold' : 'hover:text-primary-600'}`}
            >
              <Search className="w-4 h-4" /> Riset Keyword
            </button>
            <button 
              onClick={() => setCurrentPage('rank-keywords')}
              className={`transition-colors flex items-center gap-1.5 ${currentPage === 'rank-keywords' ? 'text-primary-600 font-bold' : 'hover:text-primary-600'}`}
            >
              <ListOrdered className="w-4 h-4" /> Rank Keywords
            </button>
            <button 
              onClick={() => setCurrentPage('prompt-assets')}
              className={`transition-colors flex items-center gap-1.5 ${currentPage === 'prompt-assets' ? 'text-primary-600 font-bold' : 'hover:text-primary-600'}`}
            >
              <Sparkles className="w-4 h-4" /> Prompt Assets
            </button>
            <button 
              onClick={() => setCurrentPage('metadata')}
              className={`transition-colors flex items-center gap-1.5 ${currentPage === 'metadata' ? 'text-primary-600 font-bold' : 'hover:text-primary-600'}`}
            >
              <FileText className="w-4 h-4" /> Metadata
            </button>
            <button 
              onClick={() => setCurrentPage('high-logo')}
              className={`transition-colors flex items-center gap-1.5 ${currentPage === 'high-logo' ? 'text-primary-600 font-bold' : 'hover:text-primary-600'}`}
            >
              <ImageIcon className="w-4 h-4" /> High Logo
            </button>
          </nav>
        </div>
      </header>

      <div className={currentPage === 'rank-keywords' ? 'block' : 'hidden'}>
        <RankKeywords />
      </div>
      <div className={currentPage === 'prompt-assets' ? 'block' : 'hidden'}>
        <PromptAssets />
      </div>
      <div className={currentPage === 'metadata' ? 'block' : 'hidden'}>
        <MetadataGenerator />
      </div>
      <div className={currentPage === 'high-logo' ? 'block' : 'hidden'}>
        <HighLogoGenerator />
      </div>
      <div className={currentPage === 'riset' ? 'block' : 'hidden'}>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Hero / Search Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Temukan Keyword Microstock yang Sedang Tren
              </h2>
              <p className="text-slate-600 text-lg">
                Riset kata kunci potensial untuk Adobe Stock dan Shutterstock berdasarkan data AI terbaru.
              </p>
            </div>

            <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Masukkan niche (contoh: ramadan, business, abstract background)"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-lg"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('Adobe Stock')}
                    className={`px-6 py-4 rounded-xl font-medium transition-all ${
                      platform === 'Adobe Stock'
                        ? 'bg-primary-50 text-primary-700 border-2 border-primary-500'
                        : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Adobe Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatform('Shutterstock')}
                    className={`px-6 py-4 rounded-xl font-medium transition-all ${
                      platform === 'Shutterstock'
                        ? 'bg-primary-50 text-primary-700 border-2 border-primary-500'
                        : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Shutterstock
                  </button>
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Menganalisis Tren...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Riset Sekarang
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 mb-8">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          )}

          {/* Results Section */}
          <AnimatePresence mode="wait">
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-8"
              >
                {/* Trend Score Overview Chart */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Overview Trend Score</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sortedResults} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="keyword" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: '#64748b' }} 
                          tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: '#64748b' }}
                          domain={[0, 100]}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f1f5f9' }}
                        />
                        <Bar dataKey="trendScore" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Trend Score" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Keywords List */}
                  <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        Top Keywords untuk "{niche}"
                        <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-xs font-medium">
                          {platform}
                        </span>
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">Klik header tabel untuk mengurutkan data</p>
                    </div>
                    <button
                      onClick={handleDownloadTxt}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      Simpan ke .txt
                    </button>
                  </div>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase tracking-wider">
                          <th className="p-4 font-medium">Keyword</th>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('trendScore')}
                          >
                            Trend Score {renderSortIcon('trendScore')}
                          </th>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('competition')}
                          >
                            Kompetisi {renderSortIcon('competition')}
                          </th>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('potentialDownloads')}
                          >
                            Potensi Download {renderSortIcon('potentialDownloads')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResults.map((item, idx) => (
                          <tr
                            key={idx}
                            onClick={() => setSelectedKeyword(item)}
                            className={`border-b border-slate-100 cursor-pointer transition-colors ${
                              selectedKeyword?.keyword === item.keyword
                                ? 'bg-primary-50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-4 font-medium text-slate-900">
                              <div className="flex items-center justify-between gap-2">
                                <span>{item.keyword}</span>
                                <button
                                  onClick={(e) => handleCopy(item.keyword, e)}
                                  className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-100 rounded-md transition-colors"
                                  title="Salin keyword"
                                >
                                  {copiedKeyword === item.keyword ? (
                                    <Check className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-slate-200 rounded-full h-2 max-w-[4rem]">
                                  <div
                                    className="bg-primary-500 h-2 rounded-full"
                                    style={{ width: `${item.trendScore}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-medium text-slate-700">
                                  {item.trendScore}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              {renderCompetitionBars(item.competition)}
                            </td>
                            <td className="p-4 text-slate-600 flex items-center gap-1">
                              <Download className="w-4 h-4" />
                              {item.potentialDownloads.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Keyword Details & Chart */}
                <div className="lg:col-span-1 space-y-6">
                  {selectedKeyword && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-24"
                    >
                      <h3 className="text-lg font-bold text-slate-900 mb-2">
                        Analisis Detail
                      </h3>
                      <div className="flex items-center justify-between mb-6">
                        <p className="text-2xl font-bold text-primary-600">
                          {selectedKeyword.keyword}
                        </p>
                        <button
                          onClick={(e) => handleCopy(selectedKeyword.keyword, e)}
                          className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-slate-200"
                          title="Salin keyword"
                        >
                          {copiedKeyword === selectedKeyword.keyword ? (
                            <Check className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="text-slate-500 text-sm mb-1 flex items-center gap-1">
                            <BarChart2 className="w-4 h-4" /> Score
                          </div>
                          <div className="text-2xl font-bold text-slate-900">
                            {selectedKeyword.trendScore}/100
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="text-slate-500 text-sm mb-1 flex items-center gap-1">
                            <Download className="w-4 h-4" /> Potensi
                          </div>
                          <div className="text-2xl font-bold text-slate-900">
                            {selectedKeyword.potentialDownloads.toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>

                      <h4 className="font-semibold text-slate-900 mb-4">
                        Tren 6 Bulan Terakhir
                      </h4>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 12, fill: '#64748b' }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 12, fill: '#64748b' }}
                              domain={[0, 100]}
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#3b82f6" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorScore)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-slate-100">
                        <h4 className="font-semibold text-slate-900 mb-2">Rekomendasi Aksi</h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {selectedKeyword.competition === 'Low' && selectedKeyword.trendScore > 70 
                            ? "Peluang emas! Kompetisi rendah dengan tren tinggi. Segera buat dan unggah aset dengan keyword ini."
                            : selectedKeyword.competition === 'High' 
                            ? "Kompetisi sangat ketat. Pastikan kualitas aset Anda luar biasa dan gunakan keyword spesifik (long-tail) tambahan."
                            : "Peluang yang bagus. Buat beberapa variasi aset untuk memaksimalkan visibilitas di pencarian."}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

