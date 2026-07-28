import {useCallback, useRef, useState} from 'react';
import RNFS from 'react-native-fs';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  type AudioSet,
} from 'react-native-audio-recorder-player';
import {hapticLongPress} from '../../../utils/haptics';

const audioSet: AudioSet = {
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
  AudioSourceAndroid: AudioSourceAndroidType.MIC,
  AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
  AVNumberOfChannelsKeyIOS: 1,
  AVFormatIDKeyIOS: 'aac',
};

const CANCEL_THRESHOLD = 72;
const LOCK_THRESHOLD = 64;
const WAVEFORM_BARS = 48;

function buildRecordPath(): string {
  const name = `interflow_voice_${Date.now()}.m4a`;
  return `${RNFS.CachesDirectoryPath}/${name}`;
}

/** Extrai metering do evento Nitro (optional às vezes vem embrulhado). */
function readMetering(e: {
  currentMetering?: number | null;
  currentPosition?: number;
  [key: string]: unknown;
}): number | undefined {
  const raw = e.currentMetering;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const v = (raw as {value?: unknown}).value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  // Fallback: metering embutido na fração de currentPosition (patch iOS)
  const pos = e.currentPosition;
  if (typeof pos === 'number' && Number.isFinite(pos)) {
    const frac = pos - Math.floor(pos);
    if (frac > 0) {
      const meterBits = Math.round(frac * 1_000_000);
      if (meterBits >= 0 && meterBits <= 999) {
        return (meterBits / 999) * 160 - 160;
      }
    }
  }
  return undefined;
}

/** Converte metering dB (~-160..0) em altura 0..1 — faixa útil de fala. */
function meteringToLevel(db?: number): number {
  if (db == null || !Number.isFinite(db)) return 0.1;
  // Fala típica ~-45..-10 dB
  const clamped = Math.max(-45, Math.min(0, db));
  const normalized = (clamped + 45) / 45;
  return Math.max(0.08, Math.min(1, 0.15 + normalized * 0.85));
}

function emptyLevels(): number[] {
  return Array.from({length: WAVEFORM_BARS}, () => 0.1);
}

export type VoiceReleaseAction = 'send' | 'cancel' | 'lock' | 'ignore';

export type VoiceMeterSnapshot = {
  levels: number[];
  durationMs: number;
};

export type VoiceMeterListener = (snapshot: VoiceMeterSnapshot) => void;

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [slideUp, setSlideUp] = useState(0);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [lockArmed, setLockArmed] = useState(false);
  const [paused, setPaused] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const lockedRef = useRef(false);
  const pausedRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const cancelArmedRef = useRef(false);
  const lockArmedRef = useRef(false);
  const durationRef = useRef(0);
  const levelsRef = useRef<number[]>(emptyLevels());
  const listenersRef = useRef(new Set<VoiceMeterListener>());
  const rafRef = useRef<number | null>(null);
  const lastSlideUiAtRef = useRef(0);

  const notifyMetering = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const snap: VoiceMeterSnapshot = {
        levels: levelsRef.current,
        durationMs: durationRef.current,
      };
      listenersRef.current.forEach(fn => fn(snap));
    });
  }, []);

  const subscribeMetering = useCallback((fn: VoiceMeterListener) => {
    listenersRef.current.add(fn);
    fn({levels: levelsRef.current, durationMs: durationRef.current});
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const resetUi = useCallback(() => {
    recordingRef.current = false;
    startingRef.current = false;
    lockedRef.current = false;
    pausedRef.current = false;
    setRecording(false);
    setLocked(false);
    setPaused(false);
    durationRef.current = 0;
    setSlideOffset(0);
    setSlideUp(0);
    setCancelArmed(false);
    setLockArmed(false);
    cancelArmedRef.current = false;
    lockArmedRef.current = false;
    levelsRef.current = emptyLevels();
    notifyMetering();
  }, [notifyMetering]);

  const start = useCallback(async () => {
    if (recordingRef.current || startingRef.current || lockedRef.current) {
      return;
    }
    startingRef.current = true;
    cancelRequestedRef.current = false;
    lockedRef.current = false;
    pausedRef.current = false;
    setLocked(false);
    setPaused(false);
    durationRef.current = 0;
    setSlideOffset(0);
    setSlideUp(0);
    setCancelArmed(false);
    setLockArmed(false);
    cancelArmedRef.current = false;
    lockArmedRef.current = false;
    levelsRef.current = emptyLevels();
    notifyMetering();
    setRecording(true);
    hapticLongPress();

    try {
      try {
        AudioRecorderPlayer.setSubscriptionDuration(0.1);
      } catch {
        // ignore
      }
      const path = buildRecordPath();
      await AudioRecorderPlayer.startRecorder(path, audioSet, true);
      if (cancelRequestedRef.current) {
        try {
          await AudioRecorderPlayer.stopRecorder();
          AudioRecorderPlayer.removeRecordBackListener();
        } catch {
          // ignore
        }
        resetUi();
        return;
      }
      recordingRef.current = true;
      startingRef.current = false;
      AudioRecorderPlayer.addRecordBackListener(e => {
        if (pausedRef.current) return;
        // floor: ignora fração usada p/ embutir metering no patch iOS
        durationRef.current = Math.floor(e.currentPosition || 0);
        const level = meteringToLevel(
          readMetering(e as {currentMetering?: number; currentPosition?: number}),
        );
        const next = levelsRef.current.slice(1);
        next.push(level);
        levelsRef.current = next;
        notifyMetering();
      });
    } catch (e) {
      resetUi();
      console.warn('[VoiceRecorder] start failed', e);
      throw e;
    }
  }, [notifyMetering, resetUi]);

  const lock = useCallback(() => {
    if (!recordingRef.current && !startingRef.current) return;
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    setSlideOffset(0);
    setSlideUp(0);
    setCancelArmed(false);
    setLockArmed(false);
    cancelArmedRef.current = false;
    lockArmedRef.current = false;
  }, []);

  const togglePause = useCallback(async () => {
    if (!recordingRef.current || startingRef.current) return;
    try {
      if (pausedRef.current) {
        await AudioRecorderPlayer.resumeRecorder();
        pausedRef.current = false;
        setPaused(false);
        hapticLongPress();
      } else {
        await AudioRecorderPlayer.pauseRecorder();
        pausedRef.current = true;
        setPaused(true);
        hapticLongPress();
      }
    } catch (e) {
      console.warn('[VoiceRecorder] pause/resume failed', e);
    }
  }, []);

  const stop = useCallback(async (): Promise<{
    uri: string;
    durationMs: number;
  } | null> => {
    if (startingRef.current) {
      cancelRequestedRef.current = true;
      return null;
    }
    if (!recordingRef.current) return null;
    try {
      const uri = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      const ms = durationRef.current;
      resetUi();
      if (!uri || ms < 400) return null;
      const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
      return {uri: fileUri, durationMs: ms};
    } catch (e) {
      resetUi();
      try {
        AudioRecorderPlayer.removeRecordBackListener();
      } catch {
        // ignore
      }
      console.warn('[VoiceRecorder] stop failed', e);
      return null;
    }
  }, [resetUi]);

  const cancel = useCallback(async () => {
    if (startingRef.current) {
      cancelRequestedRef.current = true;
      return;
    }
    if (!recordingRef.current) {
      resetUi();
      return;
    }
    try {
      await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
    } catch {
      // ignore
    }
    resetUi();
    hapticLongPress();
  }, [resetUi]);

  const onTouchStart = useCallback((pageX: number, pageY: number) => {
    startXRef.current = pageX;
    startYRef.current = pageY;
    setSlideOffset(0);
    setSlideUp(0);
    setCancelArmed(false);
    setLockArmed(false);
    cancelArmedRef.current = false;
    lockArmedRef.current = false;
  }, []);

  const onTouchMove = useCallback((pageX: number, pageY: number) => {
    if (lockedRef.current) return;
    if (!recordingRef.current && !startingRef.current) return;

    const dx = pageX - startXRef.current;
    const dy = pageY - startYRef.current;
    const left = Math.min(0, dx);
    const up = Math.min(0, dy);

    const mostlyUp = -up >= Math.abs(left) * 0.6;
    if (mostlyUp && -up >= 20) {
      const now = Date.now();
      if (now - lastSlideUiAtRef.current >= 16) {
        lastSlideUiAtRef.current = now;
        setSlideOffset(0);
        setSlideUp(up);
      }
      setCancelArmed(false);
      cancelArmedRef.current = false;
      const armed = -up >= LOCK_THRESHOLD;
      if (armed && !lockArmedRef.current) {
        hapticLongPress();
      }
      if (armed !== lockArmedRef.current) {
        lockArmedRef.current = armed;
        setLockArmed(armed);
      }
      return;
    }

    setSlideUp(0);
    if (lockArmedRef.current) {
      lockArmedRef.current = false;
      setLockArmed(false);
    }
    const now = Date.now();
    if (now - lastSlideUiAtRef.current >= 16) {
      lastSlideUiAtRef.current = now;
      setSlideOffset(left);
    }
    const armed = Math.abs(left) >= CANCEL_THRESHOLD;
    if (armed !== cancelArmedRef.current) {
      cancelArmedRef.current = armed;
      setCancelArmed(armed);
    } else {
      cancelArmedRef.current = armed;
    }
  }, []);

  const resolveReleaseAction = useCallback((): VoiceReleaseAction => {
    if (lockedRef.current) return 'ignore';
    if (cancelArmedRef.current) return 'cancel';
    if (lockArmedRef.current) return 'lock';
    return 'send';
  }, []);

  const formatDuration = useCallback((ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    recording,
    locked,
    paused,
    slideOffset,
    slideUp,
    cancelArmed,
    lockArmed,
    cancelThreshold: CANCEL_THRESHOLD,
    lockThreshold: LOCK_THRESHOLD,
    start,
    stop,
    cancel,
    lock,
    togglePause,
    onTouchStart,
    onTouchMove,
    formatDuration,
    resolveReleaseAction,
    subscribeMetering,
  };
}
