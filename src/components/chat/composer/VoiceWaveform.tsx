import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

type Props = {
  color: string;
  height?: number;
  paused?: boolean;
};

export type VoiceWaveformHandle = {
  /** Atualiza barras sem setState (Animated.setValue). */
  setLevels: (levels: number[]) => void;
};

const BAR_WIDTH = 2.5;
const BAR_GAP = 2;
const MAX_BARS = 48;

/**
 * Waveform performático: barras Animated — metering não causa re-render do composer.
 */
export const VoiceWaveform = memo(
  forwardRef<VoiceWaveformHandle, Props>(function VoiceWaveform(
    {color, height = 28, paused = false},
    ref,
  ) {
    const [barCount, setBarCount] = useState(24);
    const barCountRef = useRef(24);
    const anims = useRef(
      Array.from({length: MAX_BARS}, () => new Animated.Value(3)),
    ).current;

    const onLayout = useCallback((e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w <= 0) return;
      const slot = BAR_WIDTH + BAR_GAP;
      const next = Math.max(8, Math.min(MAX_BARS, Math.floor(w / slot)));
      if (next !== barCountRef.current) {
        barCountRef.current = next;
        setBarCount(next);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setLevels: (levels: number[]) => {
          const count = barCountRef.current;
          const start = Math.max(0, levels.length - count);
          for (let i = 0; i < count; i++) {
            const level = levels[start + i] ?? 0.08;
            const barH = Math.max(3, level * height);
            anims[i].setValue(barH);
          }
        },
      }),
      [anims, height],
    );

    return (
      <View
        style={[styles.row, {height, opacity: paused ? 0.45 : 1}]}
        onLayout={onLayout}>
        {Array.from({length: barCount}, (_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: anims[i],
                backgroundColor: color,
                opacity: 0.4 + (i / Math.max(1, barCount - 1)) * 0.6,
              },
            ]}
          />
        ))}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  row: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: BAR_GAP,
    minWidth: 0,
    overflow: 'hidden',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
  },
});
