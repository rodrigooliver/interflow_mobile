import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Alert,
  useWindowDimensions,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {X, Download} from 'lucide-react-native';
import {useI18n} from '../../contexts/I18nContext';
import {saveMediaToGallery} from '../../services/saveImage';
import {hapticSelection} from '../../utils/haptics';
import {radii, spacing, typography} from '../../theme/tokens';

/** Distância vertical para fechar ao soltar (igual imagem) */
const DISMISS_DISTANCE = 40;
/** Velocidade vertical para fechar no flick */
const DISMISS_VELOCITY = 320;
const DISMISS_X_FACTOR = 0.1;

type Props = {
  visible: boolean;
  uri: string | null;
  fileName?: string | null;
  onClose: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function originBaseUrl(uri: string): string {
  try {
    const match = uri.match(/^(https?:\/\/[^/]+)/i);
    if (match?.[1]) return `${match[1]}/`;
  } catch {
    // ignore
  }
  return 'https://localhost/';
}

/**
 * Injeta o src via JS (URLs assinadas com & não quebram).
 * O <video> é dimensionado pela proporção real — senão controls nativos
 * esticam até o topo da tela (elemento 100%×100%).
 */
function buildVideoSrcDoc(uri: string): string {
  const srcJson = JSON.stringify(uri);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent;
      overflow: hidden;
    }
    .wrap {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
    video {
      /* Não usar width/height 100% — controls ficariam na tela toda */
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      background: #000;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <video id="v" controls playsinline webkit-playsinline preload="metadata"></video>
  </div>
  <script>
    (function () {
      var v = document.getElementById('v');
      var fit = function () {
        var vw = v.videoWidth || 0;
        var vh = v.videoHeight || 0;
        if (!vw || !vh) return;
        var maxW = window.innerWidth;
        var maxH = window.innerHeight;
        var scale = Math.min(maxW / vw, maxH / vh);
        v.style.width = Math.floor(vw * scale) + 'px';
        v.style.height = Math.floor(vh * scale) + 'px';
      };
      v.addEventListener('loadedmetadata', fit);
      window.addEventListener('resize', fit);
      v.src = ${srcJson};
      v.load();
      var tryPlay = function () {
        fit();
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      };
      v.addEventListener('loadeddata', tryPlay);
      tryPlay();
    })();
  </script>
</body>
</html>`;
}

export function VideoPreviewModal({visible, uri, fileName, onClose}: Props) {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const {width: winW, height: winH} = useWindowDimensions();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const closingRef = useRef(false);

  const html = useMemo(() => (uri ? buildVideoSrcDoc(uri) : ''), [uri]);
  const baseUrl = useMemo(
    () => (uri ? originBaseUrl(uri) : 'https://localhost/'),
    [uri],
  );

  const resetTransform = () => {
    closingRef.current = false;
    translateX.setValue(0);
    translateY.setValue(0);
    backdropOpacity.setValue(1);
  };

  useEffect(() => {
    if (!visible || !uri) {
      setMounted(false);
      return;
    }
    setLoading(true);
    resetTransform();
    const timer = setTimeout(() => setMounted(true), 40);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, uri]);

  const dismissWithDrag = (fromY: number, velocityY = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    hapticSelection();

    const direction = fromY >= 0 || velocityY > 0 ? 1 : -1;
    const target = direction * (winH + 40);
    const speed = Math.max(Math.abs(velocityY), 900);
    const distance = Math.abs(target - fromY);
    const duration = clamp((distance / speed) * 1000, 120, 260);

    // Só o vídeo sai da tela; backdrop/botões ficam fixos e somem no fim.
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: target,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: Math.max(100, duration - 20),
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) onClose();
    });
  };

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
      }),
    ]).start();
  };

  const onPanGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    if (closingRef.current) return;
    const {translationX, translationY} = event.nativeEvent;
    // Arrasta só o vídeo — backdrop e botões ficam no lugar.
    translateX.setValue(translationX * DISMISS_X_FACTOR);
    translateY.setValue(translationY);
  };

  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    if (closingRef.current) return;

    const {translationY, velocityY} = event.nativeEvent;
    const flickDown = velocityY > DISMISS_VELOCITY && translationY > 12;
    const flickUp = velocityY < -DISMISS_VELOCITY && translationY < -12;
    const draggedFar = Math.abs(translationY) > DISMISS_DISTANCE;

    if (draggedFar || flickDown || flickUp) {
      dismissWithDrag(translationY, velocityY);
      return;
    }
    snapBack();
  };

  const handleSave = async () => {
    if (!uri || saving) return;
    hapticSelection();
    setSaving(true);
    const result = await saveMediaToGallery(uri, 'video');
    setSaving(false);
    if (result === 'saved') {
      Alert.alert(t.videoViewer.saved);
    } else if (result === 'permission_denied') {
      Alert.alert(t.videoViewer.saveError, t.videoViewer.permissionDenied);
    } else if (result === 'unavailable') {
      Alert.alert(t.videoViewer.saveError, t.videoViewer.rebuildRequired);
    } else if (result !== 'cancelled') {
      Alert.alert(t.videoViewer.saveError);
    }
  };

  const handleClose = () => {
    if (closingRef.current) return;
    onClose();
  };

  if (!uri) return null;

  // Faixa superior do vídeo captura o arraste (controles nativos ficam no centro/baixo).
  const dismissStripH = Math.max(120, Math.round(winH * 0.28));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        {/* Backdrop fixo — não traduz com o gesto. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {opacity: backdropOpacity}]}>
          <View style={styles.backdropFill} />
        </Animated.View>

        <PanGestureHandler
          onGestureEvent={onPanGestureEvent}
          onHandlerStateChange={onPanStateChange}
          activeOffsetY={[-2, 2]}>
          <Animated.View
            style={[
              styles.playerHost,
              {
                width: winW,
                height: winH,
                transform: [{translateX}, {translateY}],
              },
            ]}>
            {mounted ? (
              <WebView
                key={uri}
                originWhitelist={['*']}
                source={{html, baseUrl}}
                style={{width: winW, height: winH, backgroundColor: 'transparent'}}
                // iOS: deixa o fundo transparente p/ só o vídeo “sair” no arraste
                {...(Platform.OS === 'ios' ? {opaque: false} : {})}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                scrollEnabled={false}
                bounces={false}
                allowsBackForwardNavigationGestures={false}
                {...(Platform.OS === 'android'
                  ? {androidLayerType: 'hardware' as const}
                  : {})}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                onError={() => setLoading(false)}
                onHttpError={() => setLoading(false)}
              />
            ) : null}

            {/* Captura o pan a partir do topo do vídeo (WebView engole gestos). */}
            <View
              style={[styles.dismissStrip, {height: dismissStripH}]}
              collapsable={false}
            />

            {loading || !mounted ? (
              <ActivityIndicator
                color="#fff"
                style={StyleSheet.absoluteFill}
                size="large"
              />
            ) : null}
          </Animated.View>
        </PanGestureHandler>

        {/* Botões fixos — fora do transform do vídeo. */}
        <View style={styles.controlsLayer} pointerEvents="box-none" collapsable={false}>
          <View
            style={[
              styles.topBar,
              {paddingTop: Math.max(insets.top, 12) + 4},
            ]}
            pointerEvents="box-none">
            <Pressable
              style={styles.iconBtn}
              onPress={handleClose}
              hitSlop={12}
              accessibilityLabel={t.videoViewer.close}>
              <X size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => void handleSave()}
              disabled={saving}
              hitSlop={12}
              accessibilityLabel={t.videoViewer.save}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Download size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {fileName ? (
            <View
              style={[
                styles.nameBar,
                {paddingBottom: Math.max(insets.bottom, 12) + 8},
              ]}
              pointerEvents="none">
              <Text style={styles.nameText} numberOfLines={1}>
                {fileName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdropFill: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerHost: {
    backgroundColor: 'transparent',
  },
  dismissStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    backgroundColor: 'transparent',
  },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    alignItems: 'center',
  },
  nameText: {
    maxWidth: '100%',
    color: '#fff',
    fontSize: typography.footnote,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
});
