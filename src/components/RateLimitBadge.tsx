import React, { useEffect, useState } from 'react';
import { Activity, Clock, AlertTriangle, X } from 'lucide-react';
import { getRateLimitState, subscribeToRateLimit, RateLimitState, MAX_RPM, MAX_RPD } from '../services/rateLimitService';
import { motion, AnimatePresence } from 'motion/react';

export default function RateLimitBadge() {
  const [state, setState] = useState<RateLimitState>(getRateLimitState());
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    return subscribeToRateLimit(setState);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((state.minuteResetAt - now) / 1000));
      setTimeLeft(remaining);
      
      // Auto-refresh state if time is up
      if (remaining === 0 && (state.rpmUsed > 0 || state.isRateLimited)) {
         setState(getRateLimitState());
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.minuteResetAt, state.rpmUsed, state.isRateLimited]);

  const remainingRpm = Math.max(0, MAX_RPM - state.rpmUsed);
  const isWarning = remainingRpm <= 5;
  const isDanger = remainingRpm === 0 || state.isRateLimited;

  return (
    <div className="relative z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
          isDanger ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' :
          isWarning ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' :
          'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
        }`}
        title="Status Limit API"
      >
        {isDanger ? (
          <Clock className="w-4 h-4 animate-pulse" />
        ) : (
          <Activity className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">API Limit:</span>
        <span className="font-bold">{remainingRpm}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary-600" />
                  Status API Gemini
                </h3>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Sisa Kuota Per Menit</span>
                    <span className={`text-sm font-bold ${isDanger ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {remainingRpm} / {MAX_RPM}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${(state.rpmUsed / MAX_RPM) * 100}%` }}
                    />
                  </div>
                </div>

                {(isDanger || isWarning || state.rpmUsed > 0) && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-100">
                    <Clock className="w-4 h-4 shrink-0" />
                    <p>
                      Kuota akan direset dalam <strong className="font-bold">{timeLeft} detik</strong>.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <p>
                    Sistem akan otomatis menjeda proses jika limit tercapai untuk mencegah error.
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
