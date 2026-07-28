import React, {useEffect, useRef} from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../contexts/ThemeContext';
import {spacing} from '../theme/tokens';

type BoneProps = {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
  pulse: Animated.Value;
};

function usePulse(min = 0.45, max = 0.85) {
  const opacity = useRef(new Animated.Value(min)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: max,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: min,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, min, max]);

  return opacity;
}

function Bone({
  width,
  height,
  radius = 6,
  style,
  color,
  pulse,
}: BoneProps) {
  const {colors: theme} = useTheme();

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: color || theme.fill,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

const META_CHIP_SETS = [
  [56, 44, 72],
  [48, 64],
  [52, 40, 58, 70],
  [60, 46],
  [50, 54, 66],
];

export function ChatListSkeleton({rows = 8}: {rows?: number}) {
  const {colors: theme} = useTheme();
  const pulse = usePulse();

  return (
    <View style={[styles.list, {backgroundColor: theme.pageBg}]}>
      {Array.from({length: rows}).map((_, index) => {
        const chips = META_CHIP_SETS[index % META_CHIP_SETS.length];
        return (
          <View key={index} style={styles.row}>
            <Bone
              width={54}
              height={54}
              radius={27}
              style={styles.avatar}
              pulse={pulse}
            />
            <View
              style={[styles.body, {borderBottomColor: theme.separator}]}>
              <View style={styles.top}>
                <Bone width="52%" height={17} pulse={pulse} />
                <Bone width={36} height={12} pulse={pulse} />
              </View>
              <View style={styles.previewRow}>
                <Bone width="74%" height={15} pulse={pulse} />
              </View>
              <View style={styles.metaRow}>
                {chips.map((w, chipIndex) => (
                  <Bone
                    key={chipIndex}
                    width={w}
                    height={21}
                    radius={8}
                    pulse={pulse}
                  />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Larguras variadas, tudo centralizado — sem imitar lado in/out. */
const THREAD_WIDTHS = [0.42, 0.56, 0.36, 0.5, 0.44, 0.58];

export function ChatThreadSkeleton({rows = 6}: {rows?: number}) {
  const {colors: theme} = useTheme();
  const pulse = usePulse(0.4, 0.75);

  return (
    <View style={[styles.thread, {backgroundColor: theme.pageBg}]}>
      {Array.from({length: rows}).map((_, index) => {
        const frac = THREAD_WIDTHS[index % THREAD_WIDTHS.length];
        return (
          <Bone
            key={index}
            width={`${Math.round(frac * 100)}%`}
            height={36}
            radius={14}
            color={theme.fill}
            pulse={pulse}
            style={styles.threadBone}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {flex: 1},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: spacing.lg,
    paddingTop: 10,
  },
  avatar: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  body: {
    flex: 1,
    paddingRight: spacing.lg,
    paddingBottom: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  previewRow: {
    minHeight: 19,
    justifyContent: 'center',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 1,
  },
  thread: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 10,
  },
  threadBone: {
    alignSelf: 'center',
  },
});
