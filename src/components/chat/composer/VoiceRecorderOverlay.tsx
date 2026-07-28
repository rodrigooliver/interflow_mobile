import React, {memo, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useI18n} from '../../../contexts/I18nContext';
import {brand, radii, spacing, typography} from '../../../theme/tokens';
import {VoiceWaveform, type VoiceWaveformHandle} from './VoiceWaveform';
import type {VoiceMeterListener} from './useVoiceRecorder';

type Props = {
  subscribeMetering: (listener: VoiceMeterListener) => () => void;
  formatDuration: (ms: number) => string;
  slideOffset: number;
  cancelArmed: boolean;
  lockArmed: boolean;
  locked: boolean;
  paused?: boolean;
};

/**
 * Faixa de gravação: cronômetro + waveform.
 * Metering chega via subscribe (não re-renderiza o composer).
 */
export const VoiceRecorderOverlay = memo(function VoiceRecorderOverlay({
  subscribeMetering,
  formatDuration,
  slideOffset,
  cancelArmed,
  lockArmed,
  locked,
  paused = false,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const waveRef = useRef<VoiceWaveformHandle>(null);
  const [durationMs, setDurationMs] = useState(0);
  const lastTimerAtRef = useRef(0);

  useEffect(() => {
    return subscribeMetering(snap => {
      waveRef.current?.setLevels(snap.levels);
      // Timer ~4x/s — barato o suficiente
      const now = Date.now();
      if (now - lastTimerAtRef.current >= 200) {
        lastTimerAtRef.current = now;
        setDurationMs(snap.durationMs);
      }
    });
  }, [subscribeMetering]);

  const waveColor = useMemo(() => {
    if (cancelArmed) return '#EF4444';
    if (lockArmed || locked) return brand.blue;
    return theme.secondaryLabel;
  }, [cancelArmed, lockArmed, locked, theme.secondaryLabel]);

  const showHint = cancelArmed;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: cancelArmed
            ? 'rgba(239,68,68,0.12)'
            : locked || lockArmed
              ? brand.blueSoft
              : theme.inputBg,
          borderColor: cancelArmed
            ? '#EF4444'
            : locked || lockArmed
              ? brand.blue
              : theme.border,
          transform: [{translateX: slideOffset}],
        },
      ]}>
      <View style={styles.left}>
        <View
          style={[
            styles.liveDot,
            {
              backgroundColor: paused ? theme.tertiaryLabel : '#EF4444',
            },
          ]}
        />
        <Text
          style={[
            styles.timer,
            {color: cancelArmed ? '#EF4444' : theme.label},
          ]}>
          {formatDuration(durationMs)}
        </Text>
      </View>

      <View style={styles.waveSlot}>
        <VoiceWaveform
          ref={waveRef}
          color={waveColor}
          height={28}
          paused={paused}
        />
        {showHint ? (
          <View style={styles.hintOverlay} pointerEvents="none">
            <Text
              style={[
                styles.hint,
                {
                  color: '#EF4444',
                  backgroundColor: theme.card,
                },
              ]}
              numberOfLines={1}>
              {t.composer.slideCancelArmed}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timer: {
    fontSize: typography.subhead,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
  },
  waveSlot: {
    flex: 1,
    minWidth: 0,
    height: 28,
    justifyContent: 'center',
  },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  hint: {
    fontSize: typography.footnote,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
});
