import React, {useEffect, useRef} from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  InteractionManager,
} from 'react-native';
import SplashScreen from 'react-native-splash-screen';
import {useTheme} from '../contexts/ThemeContext';
import {
  applyBootLoadingStatusBar,
  applyThemeStatusBar,
} from '../theme/statusBar';
import LogoDark from '../assets/logos/interflow-logo-white.png';

/** Loading de boot sempre escuro (evita flash branco / mismatch de tema). */
export const LOADING_BG_DARK = '#030712';
/** @deprecated loading de abertura é sempre escuro */
export const LOADING_BG_LIGHT = LOADING_BG_DARK;

export const BOOT_LOADING_MODE = 'dark' as const;

export function loadingBackground(_mode?: 'light' | 'dark'): string {
  return LOADING_BG_DARK;
}

type VisualProps = {
  /** Ignorado — loading de abertura é sempre escuro. */
  mode?: 'light' | 'dark';
  /** Esconde splash nativo só depois do layout (evita flash branco). */
  hideNativeSplashOnLayout?: boolean;
};

let nativeSplashHidden = false;

export function hideNativeSplash() {
  if (nativeSplashHidden) return;
  nativeSplashHidden = true;
  try {
    if (SplashScreen.hide) {
      SplashScreen.hide();
    }
  } catch {
    // ignore
  }
}

/**
 * Visual do splash (logo + barra) — sempre escuro.
 */
export function LoadingScreenVisual({
  hideNativeSplashOnLayout = false,
}: VisualProps) {
  const bg = LOADING_BG_DARK;
  const track = 'rgba(55,65,81,0.8)';
  const bar = '#60A5FA';

  const logoOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(1)).current;
  const progressX = useRef(new Animated.Value(0)).current;
  const didScheduleHide = useRef(false);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 0.88,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 0.985,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const progress = Animated.loop(
      Animated.timing(progressX, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );

    pulse.start();
    progress.start();
    return () => {
      pulse.stop();
      progress.stop();
    };
  }, [logoOpacity, logoScale, progressX]);

  const translateX = progressX.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 200],
  });

  const scheduleHideNativeSplash = () => {
    if (!hideNativeSplashOnLayout || didScheduleHide.current) return;
    didScheduleHide.current = true;
    // 2 frames + afterInteractions: garante que o fundo escuro já pintou
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(hideNativeSplash, 32);
        });
      });
    });
  };

  return (
    <View
      style={[styles.root, {backgroundColor: bg}]}
      onLayout={scheduleHideNativeSplash}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(59,130,246,0.14)',
            opacity: 0.55,
          },
        ]}
      />

      <View style={styles.content}>
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{scale: logoScale}],
          }}>
          <Image
            source={LogoDark}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Interflow"
          />
        </Animated.View>

        <View style={[styles.track, {backgroundColor: track}]}>
          <Animated.View
            style={[
              styles.bar,
              {backgroundColor: bar, transform: [{translateX}]},
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export function LoadingScreen() {
  const {theme} = useTheme();

  useEffect(() => {
    applyBootLoadingStatusBar();
    // Ao sair do loading, restaura ícones do status bar para o tema do app
    return () => applyThemeStatusBar(theme);
  }, [theme]);

  return <LoadingScreenVisual hideNativeSplashOnLayout />;
}

export function BootLoadingScreen() {
  useEffect(() => {
    applyBootLoadingStatusBar();
  }, []);

  return <LoadingScreenVisual hideNativeSplashOnLayout />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: LOADING_BG_DARK,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 1,
  },
  logo: {
    width: 180,
    height: 44,
  },
  track: {
    marginTop: 32,
    height: 2,
    width: 112,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    width: '33%',
    borderRadius: 999,
  },
});
