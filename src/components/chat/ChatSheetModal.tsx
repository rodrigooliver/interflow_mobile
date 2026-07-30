import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {useTheme} from '../../contexts/ThemeContext';
import {spacing} from '../../theme/tokens';
import {ChatSheet} from './ChatSheet';

/** Evita que o mesmo toque que abriu o modal feche no backdrop. */
const BACKDROP_ARM_MS = 400;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dismissOnBackdrop?: boolean;
  keyboardAvoiding?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
  maxHeight?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  wrapSheet?: boolean;
};

/**
 * Bottom sheet card flutuante.
 * Backdrop e sheet ficam separados — ScrollView rola no fundo do conteúdo.
 */
export function ChatSheetModal({
  visible,
  onClose,
  children,
  dismissOnBackdrop = true,
  keyboardAvoiding = false,
  sheetStyle,
  maxHeight = '94%',
  minHeight,
  wrapSheet = true,
}: Props) {
  const {theme: mode} = useTheme();
  const insets = useSafeAreaInsets();
  const [backdropArmed, setBackdropArmed] = useState(false);
  const bottomInset = Math.max(
    insets.bottom,
    initialWindowMetrics?.insets.bottom ?? 0,
    spacing.sm,
  );

  useEffect(() => {
    if (!visible) {
      setBackdropArmed(false);
      return;
    }
    setBackdropArmed(false);
    const timer = setTimeout(() => setBackdropArmed(true), BACKDROP_ARM_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const content = wrapSheet ? (
    <ChatSheet
      style={sheetStyle}
      maxHeight={maxHeight}
      minHeight={minHeight}>
      {children}
    </ChatSheet>
  ) : (
    children
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={
          keyboardAvoiding && Platform.OS === 'ios' ? 'padding' : undefined
        }
        pointerEvents="box-none">
        {/* Backdrop separado — não envolve o sheet (libera o scroll) */}
        <Pressable
          style={[
            styles.backdrop,
            {
              backgroundColor:
                mode === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(17,24,39,0.35)',
            },
          ]}
          onPress={
            dismissOnBackdrop && backdropArmed ? onClose : undefined
          }
        />

        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              paddingBottom: bottomInset,
              paddingHorizontal: spacing.md,
            },
          ]}>
          <View style={styles.sheetHost}>{content}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dock: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheetHost: {
    width: '100%',
  },
});
