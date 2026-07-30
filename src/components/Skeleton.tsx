import React, {useEffect, useRef} from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../contexts/ThemeContext';
import {radii, spacing} from '../theme/tokens';

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
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: min,
          duration: 900,
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

type ThreadBubbleSpec = {
  side: 'in' | 'out';
  width: number;
  height: number;
  lines?: number;
};

/** Bolhas in/out com alturas variadas — mais próximas do thread real. */
const THREAD_BUBBLES: ThreadBubbleSpec[] = [
  {side: 'in', width: 168, height: 44},
  {side: 'out', width: 210, height: 58, lines: 2},
  {side: 'in', width: 132, height: 36},
  {side: 'out', width: 186, height: 44},
  {side: 'in', width: 244, height: 72, lines: 2},
  {side: 'out', width: 154, height: 36},
  {side: 'in', width: 198, height: 52},
  {side: 'out', width: 226, height: 64, lines: 2},
];

export function ChatThreadSkeleton({rows = 8}: {rows?: number}) {
  const {colors: theme} = useTheme();
  const pulse = usePulse(0.38, 0.72);
  const bubbles = THREAD_BUBBLES.slice(0, Math.max(4, rows));

  return (
    <View style={[styles.thread, {backgroundColor: theme.pageBg}]}>
      <View style={styles.threadTopSpacer} />
      {bubbles.map((bubble, index) => {
        const outgoing = bubble.side === 'out';
        return (
          <View
            key={index}
            style={[
              styles.threadRow,
              outgoing ? styles.threadRowOut : styles.threadRowIn,
            ]}>
            <View
              style={[
                styles.threadBubble,
                {
                  width: bubble.width,
                  minHeight: bubble.height,
                  backgroundColor: outgoing ? theme.bubbleOut : theme.fill,
                  borderBottomRightRadius: outgoing ? 6 : 18,
                  borderBottomLeftRadius: outgoing ? 18 : 6,
                },
              ]}>
              <Bone
                width="78%"
                height={11}
                radius={5}
                color={outgoing ? theme.bubbleOutMuted : theme.separator}
                pulse={pulse}
              />
              {bubble.lines === 2 ? (
                <Bone
                  width="54%"
                  height={11}
                  radius={5}
                  color={outgoing ? theme.bubbleOutMuted : theme.separator}
                  pulse={pulse}
                  style={styles.threadLineGap}
                />
              ) : null}
              <Bone
                width={28}
                height={8}
                radius={4}
                color={outgoing ? theme.bubbleOutMuted : theme.separator}
                pulse={pulse}
                style={styles.threadTime}
              />
            </View>
          </View>
        );
      })}
      <View style={styles.threadBottomSpacer} />
    </View>
  );
}

/** Composer / ações do footer durante loading — mesmo box do MessageInput.shell. */
export function ChatThreadFooterSkeleton() {
  const {colors: theme} = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = usePulse(0.4, 0.78);
  const bottomPad = Math.max(insets.bottom, spacing.sm);

  return (
    <View
      style={[
        styles.footerShell,
        {
          backgroundColor: theme.pageBg,
          paddingBottom: bottomPad,
        },
      ]}
      pointerEvents="none">
      <View style={styles.footerRow}>
        <Bone
          width={40}
          height={40}
          radius={20}
          color={theme.fill}
          pulse={pulse}
        />
        <View
          style={[
            styles.footerInput,
            {
              backgroundColor: theme.fill,
              borderColor: theme.border,
            },
          ]}>
          <Bone width="38%" height={12} radius={6} pulse={pulse} />
        </View>
        <Bone
          width={40}
          height={40}
          radius={20}
          color={theme.fill}
          pulse={pulse}
        />
      </View>
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
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  threadTopSpacer: {
    flexGrow: 1,
    minHeight: spacing.lg,
  },
  threadBottomSpacer: {
    height: spacing.sm,
  },
  threadRow: {
    width: '100%',
    flexDirection: 'row',
  },
  threadRowIn: {
    justifyContent: 'flex-start',
  },
  threadRowOut: {
    justifyContent: 'flex-end',
  },
  threadBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 0,
  },
  threadLineGap: {
    marginTop: 8,
  },
  threadTime: {
    alignSelf: 'flex-end',
    marginTop: 10,
  },
  // Espelha MessageInput.shell (absolute bottom) para o cross-fade sem pulo
  footerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 52,
  },
  footerInput: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
