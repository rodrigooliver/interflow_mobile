import React from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {radii} from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Fração da altura da tela (0–1) ou px. Default ~94%. */
  maxHeight?: number | `${number}%`;
  /** Fração da altura da tela (0–1) ou px. */
  minHeight?: number | `${number}%`;
};

function resolveHeight(
  value: number | `${number}%` | undefined,
  windowHeight: number,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  const pct = Number.parseFloat(value);
  if (Number.isNaN(pct)) return undefined;
  return (windowHeight * pct) / 100;
}

/**
 * Card do bottom-sheet (fundo opaco, cantos arredondados).
 * Use ScrollView/FlatList com style={chatModalStyles.scroll} no corpo.
 */
export function ChatSheet({
  children,
  style,
  maxHeight = '94%',
  minHeight,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {height: windowHeight} = useWindowDimensions();
  const bg = mode === 'dark' ? '#1F2937' : '#FFFFFF';

  const resolvedMax = resolveHeight(maxHeight, windowHeight);
  const resolvedMin = resolveHeight(minHeight, windowHeight);

  return (
    <View
      style={[
        styles.sheet,
        {
          maxHeight: resolvedMax,
          // Altura em px (via % da tela) para o ScrollView flex:1 rolar no fundo
          height: resolvedMin,
          backgroundColor: bg,
          borderColor: theme.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: '100%',
    flexDirection: 'column',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
});
