import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Calendar, Clock, CalendarDays, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getRankedKeywords, RankedKeywordData } from '../services/geminiService';

export default function RankKeywords() {
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'year' | null>(null);
  const [platform, setPlatform] = useState<'Adobe Stock' | 'Shutterstock'>('Adobe Stock');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RankedKeywordData[]>([]);
  const [error, setError] = useState('');

  const fetchRankings = async (selectedTimeframe: 'week' | 'month' | 'year', selectedPlatform: 'Adobe Stock' | 'Shutterstock') => {
    setLoading(true);
    setError('');
    try {
      const data = await getRankedKeywords(selectedTimeframe, selectedPlatform);
      setResults(data);
    } catch (err) {
      setError('Gagal mengambil data peringkat. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeframeClick = (newTimeframe: 'week' | 'month' | 'year') => {
    setTimeframe(newTimeframe);
    fetchRankings(newTimeframe, platform);
  };

  const handlePlatformClick = (newPlatform: 'Adobe Stock' | 'Shutterstock') => {
    setPlatform(newPlatform);
    if (timeframe) {
      fetchRankings(timeframe, newPlatform);
    }
  };

  const renderTrendIcon = (direction: string) => {
    if (direction === 'up') return <TrendingUp className="w-5 h-5 text-emerald-500" />;
    if (direction === 'down') return <TrendingDown className="w-5 h-5 text-rose-500" />;
    return <Minus className="w-5 h-5 text-slate-400" />;
  };

  const renderDemandBadge = (demand: string) => {
    const styles = {
      'Extreme': 'bg-purple-100 text-purple-700 border-purple-200',
      'Very High': 'bg-rose-100 text-rose-700 border-rose-200',
      'High': 'bg-amber-100 text-amber-700 border-amber-200',
    }[demand] || 'bg-slate-100 text-slate-700 border-slate-200';

    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${styles}`}>
        {demand}
      </span>
    );
  };

  const handleDownload = () => {
    if (results.length === 0) return;

    let content = `Rank Keywords - ${platform} (${timeframe})\n`;
    content += `Generated on: ${new Date().toLocaleString('id-ID')}\n\n`;
    
    results.forEach((item) => {
      content += `${item.rank}. ${item.keyword}\n`;
      content += `   Demand: ${item.demand}\n`;
      content += `   Search Volume: ${item.searchVolume.toLocaleString('id-ID')}\n`;
      content += `   Trend: ${item.trendDirection}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rank-keywords-${platform.toLowerCase().replace(' ', '-')}-${timeframe}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Rank Keywords</h2>
              <p className="text-slate-500">Top keywords paling dicari secara real-time</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => handlePlatformClick('Adobe Stock')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  platform === 'Adobe Stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Adobe Stock
              </button>
              <button
                onClick={() => handlePlatformClick('Shutterstock')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  platform === 'Shutterstock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shutterstock
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-8 border-b border-slate-200 pb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleTimeframeClick('week')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                timeframe === 'week' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Clock className="w-4 h-4" /> Minggu Ini
            </button>
            <button
              onClick={() => handleTimeframeClick('month')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                timeframe === 'month' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-4 h-4" /> Bulan Ini
            </button>
            <button
              onClick={() => handleTimeframeClick('year')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                timeframe === 'year' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CalendarDays className="w-4 h-4" /> Tahun Ini
            </button>
          </div>

          {results.length > 0 && !loading && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" /> Download .txt
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 mb-8">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
            <p className="text-slate-500 font-medium">Mengambil data real-time dari {platform}...</p>
          </div>
        ) : !timeframe ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Trophy className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium text-center max-w-md">
              Pilih rentang waktu (Minggu Ini, Bulan Ini, atau Tahun Ini) untuk melihat data tren keyword yang paling banyak dicari di {platform}.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${platform}-${timeframe}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="overflow-x-auto"
            >
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase tracking-wider">
                    <th className="p-4 font-medium w-20 text-center">Rank</th>
                    <th className="p-4 font-medium">Keyword</th>
                    <th className="p-4 font-medium">Demand</th>
                    <th className="p-4 font-medium">Volume Pencarian</th>
                    <th className="p-4 font-medium text-center">Tren</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item) => (
                    <tr
                      key={item.rank}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                          item.rank === 1 ? 'bg-amber-100 text-amber-700' :
                          item.rank === 2 ? 'bg-slate-200 text-slate-700' :
                          item.rank === 3 ? 'bg-orange-100 text-orange-800' :
                          'text-slate-500'
                        }`}>
                          {item.rank}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-slate-900 text-lg">
                        {item.keyword}
                      </td>
                      <td className="p-4">
                        {renderDemandBadge(item.demand)}
                      </td>
                      <td className="p-4 font-medium text-slate-700">
                        {item.searchVolume.toLocaleString('id-ID')}
                      </td>
                      <td className="p-4 flex justify-center">
                        {renderTrendIcon(item.trendDirection)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
