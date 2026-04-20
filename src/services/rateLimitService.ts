export const MAX_RPM = 1500; // Limit dinaikkan agar tidak membatasi API key berbayar
export const MAX_RPD = 15000; // Limit standar harian

export interface RateLimitState {
  rpmUsed: number;
  rpdUsed: number;
  minuteResetAt: number;
  dayResetAt: number;
  isRateLimited: boolean;
}

type Listener = (state: RateLimitState) => void;
const listeners = new Set<Listener>();

const STORAGE_KEY = 'gemini_rate_limit_state';

export function getRateLimitState(): RateLimitState {
  const now = Date.now();
  let state: RateLimitState = {
    rpmUsed: 0,
    rpdUsed: 0,
    minuteResetAt: now + 60000,
    dayResetAt: now + 86400000,
    isRateLimited: false,
  };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (now < parsed.dayResetAt) {
        state.rpdUsed = parsed.rpdUsed;
        state.dayResetAt = parsed.dayResetAt;
      }
      if (now < parsed.minuteResetAt) {
        state.rpmUsed = parsed.rpmUsed;
        state.minuteResetAt = parsed.minuteResetAt;
        state.isRateLimited = parsed.isRateLimited;
      }
    }
  } catch (e) {}

  return state;
}

function saveState(state: RateLimitState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach(l => l(state));
}

export function subscribeToRateLimit(listener: Listener) {
  listeners.add(listener);
  listener(getRateLimitState());
  return () => listeners.delete(listener);
}

export async function waitForRateLimit(): Promise<void> {
  let state = getRateLimitState();
  const now = Date.now();

  if (state.isRateLimited || state.rpmUsed >= MAX_RPM) {
    const waitTime = state.minuteResetAt - now;
    if (waitTime > 0) {
      state.isRateLimited = true;
      saveState(state);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return waitForRateLimit(); // Cek lagi setelah menunggu
    } else {
      state.rpmUsed = 0;
      state.minuteResetAt = Date.now() + 60000;
      state.isRateLimited = false;
    }
  }

  state.rpmUsed++;
  state.rpdUsed++;
  
  // Jika ini request pertama di menit ini, set timer reset ke 60 detik dari sekarang
  if (state.rpmUsed === 1) {
    state.minuteResetAt = Date.now() + 60000;
  }
  
  saveState(state);
}

export function reportRateLimitError() {
  let state = getRateLimitState();
  state.isRateLimited = true;
  state.minuteResetAt = Date.now() + 60000; // Paksa tunggu 60 detik
  saveState(state);
}
