// Voice input using the phone's or browser's built-in speech recognition (free, no extra apps).
import { useEffect, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const SR: (new () => Recognition) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined
    : undefined;

export const speechSupported = Boolean(SR);

/** Calls onText with (text so far) while you speak. */
export function useSpeech(onText: (spoken: string) => void, onError: (msg: string) => void) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  const start = () => {
    if (!SR) return;
    const r = new SR();
    r.lang = navigator.language || 'en-GB';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      onError(e.error === 'not-allowed' ? 'Microphone access is off. Use the mic on your keyboard instead.' : 'Voice didn’t work this time. Try the mic on your keyboard.');
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      onError('Voice didn’t work this time. Try the mic on your keyboard.');
    }
  };

  const stop = () => rec.current?.stop();
  return { listening, toggle: () => (listening ? stop() : start()) };
}
