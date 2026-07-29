import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import SoundPlayer from 'react-native-sound-player';
import {Play, Pause} from 'lucide-react-native';
import {hapticSelection} from '../../utils/haptics';
import {
  getActiveAudioUrl,
  setActiveAudioUrl,
  subscribeActiveAudio,
} from '../../utils/audioPlayback';
import {radii, typography} from '../../theme/tokens';

type Props = {
  url: string;
  out?: boolean;
  accentColor: string;
  textColor: string;
  trackColor: string;
  fillColor: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatAudioPlayer({
  url,
  accentColor,
  textColor,
  trackColor,
  fillColor,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const mountedRef = useRef(true);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);

  const stopProgressTimer = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  const pollProgress = useCallback(async () => {
    if (!isActiveRef.current) return;
    try {
      const info = await SoundPlayer.getInfo();
      if (!mountedRef.current || !isActiveRef.current) return;
      if (Number.isFinite(info.currentTime)) {
        setCurrentTime(Math.max(0, info.currentTime));
      }
      if (Number.isFinite(info.duration) && info.duration > 0) {
        setDuration(info.duration);
      }
    } catch {
      // ignore while loading
    }
  }, []);

  const startProgressTimer = useCallback(() => {
    stopProgressTimer();
    void pollProgress();
    progressTimer.current = setInterval(() => {
      void pollProgress();
    }, 250);
  }, [pollProgress, stopProgressTimer]);

  useEffect(() => {
    mountedRef.current = true;

    const finishedPlaying = SoundPlayer.addEventListener(
      'FinishedPlaying',
      ({success}) => {
        if (!isActiveRef.current) return;
        setPlaying(false);
        stopProgressTimer();
        if (success) {
          setCurrentTime(0);
        }
        setActiveAudioUrl(null);
        isActiveRef.current = false;
      },
    );

    const finishedLoading = SoundPlayer.addEventListener(
      'FinishedLoadingURL',
      ({success, url: loadedUrl}) => {
        if (loadedUrl !== url) return;
        if (!mountedRef.current) return;
        setLoading(false);
        if (!success) {
          setError(true);
          setPlaying(false);
          isActiveRef.current = false;
          setActiveAudioUrl(null);
          return;
        }
        void pollProgress();
      },
    );

    const setupError = SoundPlayer.addEventListener('OnSetupError', () => {
      if (!isActiveRef.current) return;
      setError(true);
      setLoading(false);
      setPlaying(false);
      stopProgressTimer();
      isActiveRef.current = false;
      setActiveAudioUrl(null);
    });

    const unsubActive = subscribeActiveAudio(active => {
      if (active !== url && isActiveRef.current) {
        isActiveRef.current = false;
        setPlaying(false);
        setLoading(false);
        stopProgressTimer();
      }
    });

    return () => {
      mountedRef.current = false;
      finishedPlaying.remove();
      finishedLoading.remove();
      setupError.remove();
      unsubActive();
      stopProgressTimer();
      if (getActiveAudioUrl() === url) {
        try {
          SoundPlayer.stop();
        } catch {
          // ignore
        }
        setActiveAudioUrl(null);
      }
    };
  }, [url, pollProgress, stopProgressTimer]);

  const togglePlay = async () => {
    if (!url || error) return;
    hapticSelection();

    try {
      if (playing && isActiveRef.current) {
        SoundPlayer.pause();
        setPlaying(false);
        stopProgressTimer();
        return;
      }

      // Retomar o mesmo áudio pausado
      if (isActiveRef.current && getActiveAudioUrl() === url && currentTime > 0) {
        SoundPlayer.resume();
        setPlaying(true);
        startProgressTimer();
        return;
      }

      setLoading(true);
      setError(false);
      isActiveRef.current = true;
      setActiveAudioUrl(url);

      try {
        SoundPlayer.setSpeaker(true);
      } catch {
        // Android não tem setSpeaker
      }

      SoundPlayer.playUrl(url);
      setPlaying(true);
      startProgressTimer();
      // loading sai no FinishedLoadingURL; fallback:
      setTimeout(() => {
        if (mountedRef.current && isActiveRef.current) {
          setLoading(false);
        }
      }, 800);
    } catch (e) {
      console.warn('[ChatAudioPlayer] play failed', e);
      setError(true);
      setLoading(false);
      setPlaying(false);
      isActiveRef.current = false;
      setActiveAudioUrl(null);
      stopProgressTimer();
    }
  };

  const seekTo = (locationX: number) => {
    if (!duration || !trackWidth || !isActiveRef.current) return;
    const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
    const next = ratio * duration;
    try {
      SoundPlayer.seek(next);
      setCurrentTime(next);
    } catch {
      // ignore
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const timeLabel =
    playing || currentTime > 0
      ? formatTime(currentTime)
      : duration > 0
        ? formatTime(duration)
        : '0:00';

  return (
    <View style={styles.root}>
      <Pressable
        style={[styles.playBtn, {backgroundColor: fillColor}]}
        onPress={() => void togglePlay()}
        disabled={loading && !playing}>
        {loading && !playing ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : playing ? (
          <Pause size={18} color={accentColor} fill={accentColor} />
        ) : (
          <Play size={18} color={accentColor} fill={accentColor} />
        )}
      </Pressable>

      <View style={styles.meta}>
        <Pressable
          style={[styles.track, {backgroundColor: trackColor}]}
          onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
          onPress={e => seekTo(e.nativeEvent.locationX)}
          hitSlop={{top: 12, bottom: 12, left: 0, right: 0}}>
          <View
            style={[
              styles.trackFill,
              {
                backgroundColor: accentColor,
                width: `${Math.max(progress * 100, playing ? 2 : 0)}%`,
              },
            ]}
          />
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: accentColor,
                left: `${progress * 100}%`,
                opacity: duration > 0 ? 1 : 0,
              },
            ]}
          />
        </Pressable>
        <Text style={[styles.time, {color: textColor}]}>
          {error ? '—' : timeLabel}
        </Text>
      </View>
    </View>
  );
}

const PLAY_SIZE = 40;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    maxWidth: 260,
  },
  playBtn: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    height: PLAY_SIZE,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    justifyContent: 'center',
    // Sobretudo com horário da mensagem sobreposto: sobe um pouco do centro
    marginBottom: 8,
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    top: -3,
  },
  time: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    fontSize: typography.caption,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
});
