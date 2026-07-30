import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Modal,
  View,
  Image,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
  StatusBar,
  Alert,
  Easing,
} from 'react-native';
import {
  PinchGestureHandler,
  PanGestureHandler,
  TapGestureHandler,
  State,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {X, Share2, Download, ZoomIn, ZoomOut} from 'lucide-react-native';
import {useI18n} from '../../contexts/I18nContext';
import {saveImageToGallery, shareImage} from '../../services/saveImage';
import {hapticSelection} from '../../utils/haptics';
import {radii, spacing, typography} from '../../theme/tokens';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.4;
/** Distância vertical (sem zoom) para fechar ao soltar */
const DISMISS_DISTANCE = 40;
/** Velocidade vertical (sem zoom) para fechar — responde no flick imediato */
const DISMISS_VELOCITY = 320;
/** Resistência ao arrastar horizontal no dismiss */
const DISMISS_X_FACTOR = 0.1;

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function ImageViewerModal({visible, uri, onClose}: Props) {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const {width: winW, height: winH} = useWindowDimensions();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scaleValue, setScaleValue] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const zoomed = scaleValue > 1.05;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const lastOffset = useRef({x: 0, y: 0});
  const pinchStartScale = useRef(1);
  const pinchStartOffset = useRef({x: 0, y: 0});
  /** Focal no início da pinça (coords relativas ao centro) — ancora o zoom. */
  const pinchStartFocal = useRef({x: 0, y: 0});
  const pinchSessionActive = useRef(false);
  const closingRef = useRef(false);
  const controlsShownRef = useRef(true);

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const doubleTapRef = useRef(null);
  const singleTapRef = useRef(null);

  /** Tamanho exibido em scale=1 (contain na tela) — sem letterbox no view. */
  const displaySize = useMemo(() => {
    if (!naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) {
      return {width: winW, height: winH * 0.72};
    }
    const ratio = naturalSize.w / naturalSize.h;
    const screenRatio = winW / winH;
    if (ratio > screenRatio) {
      return {width: winW, height: winW / ratio};
    }
    return {width: winH * ratio, height: winH};
  }, [naturalSize, winW, winH]);

  const imageW = displaySize.width;
  const imageH = displaySize.height;
  // Refs para o pinch usar sempre o tamanho atual (evita clamp defasado).
  const layoutRef = useRef({imageW, imageH, winW, winH});
  layoutRef.current = {imageW, imageH, winW, winH};

  /**
   * Transform: scale → translate (T em pixels de tela).
   * Borda da imagem cola na borda da tela:
   *   |T| <= max(0, (img*S - screen) / 2)
   */
  const getPanBounds = useCallback((scale: number) => {
    const {imageW: w, imageH: h, winW: sw, winH: sh} = layoutRef.current;
    const s = Math.max(scale, 0.01);
    return {
      maxX: Math.max(0, (w * s - sw) / 2),
      maxY: Math.max(0, (h * s - sh) / 2),
    };
  }, []);

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const {maxX, maxY} = getPanBounds(scale);
      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [getPanBounds],
  );

  const setControlsShown = useCallback(
    (shown: boolean, animated = true) => {
      if (closingRef.current && shown) return;
      controlsShownRef.current = shown;
      setControlsVisible(shown);
      if (animated) {
        Animated.timing(controlsOpacity, {
          toValue: shown ? 1 : 0,
          duration: shown ? 140 : 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      } else {
        controlsOpacity.setValue(shown ? 1 : 0);
      }
    },
    [controlsOpacity],
  );

  const resetTransform = useCallback(() => {
    lastScale.current = 1;
    lastOffset.current = {x: 0, y: 0};
    pinchStartScale.current = 1;
    pinchStartOffset.current = {x: 0, y: 0};
    pinchStartFocal.current = {x: 0, y: 0};
    pinchSessionActive.current = false;
    closingRef.current = false;
    controlsShownRef.current = true;
    setScaleValue(1);
    setControlsVisible(true);
    scaleAnim.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    backdropOpacity.setValue(1);
    controlsOpacity.setValue(1);
  }, [scaleAnim, translateX, translateY, backdropOpacity, controlsOpacity]);

  useEffect(() => {
    if (!visible || !uri) return;
    setLoading(true);
    setSaving(false);
    setSharing(false);
    setNaturalSize(null);
    resetTransform();

    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) {
          setNaturalSize({w, h});
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [visible, uri, resetTransform]);

  // Quando o tamanho natural chega, re-aplica o clamp nas bordas reais.
  useEffect(() => {
    if (!naturalSize) return;
    const next = clampOffset(
      lastOffset.current.x,
      lastOffset.current.y,
      lastScale.current,
    );
    lastOffset.current = next;
    translateX.setValue(next.x);
    translateY.setValue(next.y);
  }, [naturalSize, imageW, imageH, clampOffset, translateX, translateY]);

  const applyScale = (
    next: number,
    opts?: {animated?: boolean; offset?: {x: number; y: number}},
  ) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    const offset = clampOffset(
      opts?.offset?.x ?? (clamped === 1 ? 0 : lastOffset.current.x),
      opts?.offset?.y ?? (clamped === 1 ? 0 : lastOffset.current.y),
      clamped,
    );
    lastScale.current = clamped;
    lastOffset.current = offset;
    setScaleValue(clamped);

    if (opts?.animated === false) {
      scaleAnim.setValue(clamped);
      translateX.setValue(offset.x);
      translateY.setValue(offset.y);
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: clamped,
          useNativeDriver: true,
          friction: 8,
          tension: 120,
        }),
        Animated.spring(translateX, {
          toValue: offset.x,
          useNativeDriver: true,
          friction: 8,
          tension: 120,
        }),
        Animated.spring(translateY, {
          toValue: offset.y,
          useNativeDriver: true,
          friction: 8,
          tension: 120,
        }),
      ]).start();
    }

    if (clamped === 1) {
      backdropOpacity.setValue(1);
    }
  };

  const dismissWithDrag = (fromY: number, velocityY = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    hapticSelection();
    // Opacity nativa imediata; state só pra pointerEvents (controles ficam montados).
    controlsOpacity.setValue(0);
    controlsShownRef.current = false;
    setControlsVisible(false);

    const direction = fromY >= 0 || velocityY > 0 ? 1 : -1;
    const target = direction * (winH + 40);
    const speed = Math.max(Math.abs(velocityY), 900);
    const distance = Math.abs(target - fromY);
    const duration = clamp((distance / speed) * 1000, 120, 260);

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
        toValue: lastOffset.current.x,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
        velocity: 0,
      }),
      Animated.spring(translateY, {
        toValue: lastOffset.current.y,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
        velocity: 0,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const zoomIn = () => {
    hapticSelection();
    applyScale(lastScale.current * ZOOM_STEP);
  };

  const zoomOut = () => {
    hapticSelection();
    applyScale(lastScale.current / ZOOM_STEP);
  };

  /** Focal do handler → coords relativas ao centro da tela. */
  const focalToCenter = (focalX: number, focalY: number) => ({
    x: focalX - winW / 2,
    y: focalY - winH / 2,
  });

  /**
   * Zoom dirigido pela pinça com transform scale → translate (T em tela):
   * ponto local sob o focal: (F0 - T0) / S0
   * T' = F - local * S'  →  T' = F - (F0 - T0) * S' / S0
   */
  const offsetForPinch = (
    focalX: number,
    focalY: number,
    nextScale: number,
  ) => {
    const s0 = Math.max(pinchStartScale.current, 0.01);
    const s1 = Math.max(nextScale, 0.01);
    const focal = focalToCenter(focalX, focalY);
    const f0 = pinchStartFocal.current;
    const t0 = pinchStartOffset.current;
    return clampOffset(
      focal.x - ((f0.x - t0.x) * s1) / s0,
      focal.y - ((f0.y - t0.y) * s1) / s0,
      nextScale,
    );
  };

  const beginPinch = (focalX: number, focalY: number) => {
    if (pinchSessionActive.current) return;
    pinchSessionActive.current = true;
    pinchStartScale.current = lastScale.current;
    pinchStartOffset.current = {...lastOffset.current};
    pinchStartFocal.current = focalToCenter(focalX, focalY);
    if (controlsShownRef.current) setControlsShown(false, true);
  };

  const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
    if (closingRef.current) return;
    const {scale, focalX, focalY} = event.nativeEvent;
    if (!pinchSessionActive.current) {
      beginPinch(focalX, focalY);
    }
    const next = clamp(
      pinchStartScale.current * scale,
      MIN_SCALE,
      MAX_SCALE,
    );
    const clamped = offsetForPinch(focalX, focalY, next);

    scaleAnim.setValue(next);
    translateX.setValue(clamped.x);
    translateY.setValue(clamped.y);
    // Mantém lastOffset sincronizado durante a pinça (pan subsequente correto).
    lastOffset.current = clamped;
    lastScale.current = next;
  };

  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    const {state, oldState, focalX, focalY, scale} = event.nativeEvent;

    // BEGAN às vezes vem sem focal estável — reforça no ACTIVE.
    if (state === State.BEGAN || (state === State.ACTIVE && oldState === State.BEGAN)) {
      beginPinch(focalX, focalY);
      return;
    }

    if (oldState === State.ACTIVE) {
      const next = clamp(
        pinchStartScale.current * scale,
        MIN_SCALE,
        MAX_SCALE,
      );
      const nextOffset = offsetForPinch(focalX, focalY, next);
      applyScale(next, {animated: false, offset: nextOffset});
      pinchSessionActive.current = false;
      setScaleValue(next);
      if (next <= 1.05) setControlsShown(true, true);
    }
  };

  const onPanGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    if (closingRef.current || pinchSessionActive.current) return;
    const {translationX, translationY} = event.nativeEvent;
    const notZoomed = lastScale.current <= 1.05;

    if (notZoomed) {
      // Sem zoom: dismiss vertical com leve drift horizontal
      translateX.setValue(translationX * DISMISS_X_FACTOR);
      translateY.setValue(translationY);
      const progress = Math.min(1, Math.abs(translationY) / (winH * 0.38));
      backdropOpacity.setValue(Math.max(0.2, 1 - progress * 0.85));
      // Só opacity — sem unmount (evita flicker dos botões).
      if (Math.abs(translationY) > 10) {
        controlsOpacity.setValue(Math.max(0, 1 - progress * 2.2));
      }
      return;
    }

    // T em pixels de tela (scale → translate)
    const next = clampOffset(
      lastOffset.current.x + translationX,
      lastOffset.current.y + translationY,
      lastScale.current,
    );
    translateX.setValue(next.x);
    translateY.setValue(next.y);
  };

  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const {state, oldState} = event.nativeEvent;
    if (state === State.BEGAN && pinchSessionActive.current) return;
    if (oldState !== State.ACTIVE) return;
    if (closingRef.current || pinchSessionActive.current) return;

    const {translationX, translationY, velocityY} = event.nativeEvent;
    const notZoomed = lastScale.current <= 1.05;

    if (notZoomed) {
      const flickDown =
        velocityY > DISMISS_VELOCITY && translationY > 12;
      const flickUp =
        velocityY < -DISMISS_VELOCITY && translationY < -12;
      const draggedFar = Math.abs(translationY) > DISMISS_DISTANCE;
      const shouldDismiss = draggedFar || flickDown || flickUp;

      if (shouldDismiss) {
        dismissWithDrag(translationY, velocityY);
        return;
      }

      lastOffset.current = {x: 0, y: 0};
      snapBack();
      setControlsShown(true, true);
      return;
    }

    const next = clampOffset(
      lastOffset.current.x + translationX,
      lastOffset.current.y + translationY,
      lastScale.current,
    );
    lastOffset.current = next;

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: next.x,
        useNativeDriver: true,
        friction: 8,
        tension: 120,
      }),
      Animated.spring(translateY, {
        toValue: next.y,
        useNativeDriver: true,
        friction: 8,
        tension: 120,
      }),
    ]).start();
  };

  const onDoubleTap = (event: TapGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    if (closingRef.current) return;
    hapticSelection();
    if (lastScale.current > 1.05) {
      applyScale(1);
      setControlsShown(true, true);
      return;
    }
    // Zoom no ponto do double-tap (scale → translate)
    const {x, y} = event.nativeEvent;
    const focal = focalToCenter(x, y);
    const targetScale = 2.5;
    const s0 = Math.max(lastScale.current, 0.01);
    const t0 = lastOffset.current;
    const nextOffset = clampOffset(
      focal.x - ((focal.x - t0.x) * targetScale) / s0,
      focal.y - ((focal.y - t0.y) * targetScale) / s0,
      targetScale,
    );
    applyScale(targetScale, {offset: nextOffset});
    setControlsShown(false, true);
  };

  const onSingleTap = (event: TapGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    if (closingRef.current) return;
    setControlsShown(!controlsShownRef.current, true);
  };

  const handleSaveToPhotos = async () => {
    if (!uri || saving) return;
    hapticSelection();
    setSaving(true);
    const result = await saveImageToGallery(uri);
    setSaving(false);
    if (result === 'saved') {
      Alert.alert(t.imageViewer.saved);
    } else if (result === 'permission_denied') {
      Alert.alert(t.imageViewer.saveError, t.imageViewer.permissionDenied);
    } else if (result === 'unavailable') {
      Alert.alert(t.imageViewer.saveError, t.imageViewer.rebuildRequired);
    } else if (result !== 'cancelled') {
      Alert.alert(t.imageViewer.saveError);
    }
  };

  const handleShare = async () => {
    if (!uri || sharing) return;
    hapticSelection();
    setSharing(true);
    const result = await shareImage(uri);
    setSharing(false);
    if (result === 'error') {
      Alert.alert(t.imageViewer.shareError);
    }
  };

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, {opacity: backdropOpacity}]}>
          <View style={styles.backdropFill} />
        </Animated.View>

        {/*
          Taps em simultaneous com pan/pinch — evita waitFor atrasar o dismiss
          logo ao abrir a imagem.
        */}
        <TapGestureHandler
          ref={singleTapRef}
          waitFor={doubleTapRef}
          simultaneousHandlers={[panRef, pinchRef]}
          onHandlerStateChange={onSingleTap}>
          <Animated.View style={styles.flex}>
            <TapGestureHandler
              ref={doubleTapRef}
              numberOfTaps={2}
              maxDelayMs={220}
              simultaneousHandlers={[panRef, pinchRef]}
              onHandlerStateChange={onDoubleTap}>
              <Animated.View style={styles.flex}>
                <PanGestureHandler
                  ref={panRef}
                  simultaneousHandlers={[pinchRef, doubleTapRef, singleTapRef]}
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanStateChange}
                  minPointers={1}
                  maxPointers={1}
                  avgTouches
                  // Sem zoom: ativa dismiss rápido; sem failOffsetX (não bloqueia flick).
                  {...(zoomed
                    ? {}
                    : {
                        activeOffsetY: [-2, 2] as [number, number],
                      })}>
                  <Animated.View style={styles.stage}>
                    <PinchGestureHandler
                      ref={pinchRef}
                      simultaneousHandlers={[panRef, doubleTapRef, singleTapRef]}
                      onGestureEvent={onPinchGestureEvent}
                      onHandlerStateChange={onPinchStateChange}>
                      <Animated.View style={styles.pinchHost}>
                        {/*
                          Translate (tela) por fora + scale por dentro:
                          |T| <= max(0, (img*S - screen)/2) cola a borda sem faixa preta.
                        */}
                        <Animated.View
                          style={[
                            styles.imageWrap,
                            {transform: [{translateX}, {translateY}]},
                          ]}>
                          <Animated.View
                            style={{transform: [{scale: scaleAnim}]}}>
                            {loading ? (
                              <ActivityIndicator
                                color="#fff"
                                style={StyleSheet.absoluteFill}
                              />
                            ) : null}
                            <Image
                              source={{uri}}
                              style={{width: imageW, height: imageH}}
                              resizeMode="cover"
                              onLoad={e => {
                                const src = e.nativeEvent.source as {
                                  width?: number;
                                  height?: number;
                                };
                                if (
                                  src?.width &&
                                  src?.height &&
                                  src.width > 0 &&
                                  src.height > 0
                                ) {
                                  setNaturalSize({w: src.width, h: src.height});
                                }
                                setLoading(false);
                              }}
                              onError={() => setLoading(false)}
                            />
                          </Animated.View>
                        </Animated.View>
                      </Animated.View>
                    </PinchGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
              </Animated.View>
            </TapGestureHandler>
          </Animated.View>
        </TapGestureHandler>

        {/* Sempre montado: só opacity — evita flicker ao fechar rápido. */}
        <Animated.View
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
          collapsable={false}
          style={[
            styles.controlsLayer,
            {opacity: controlsOpacity},
          ]}>
          <View
            style={[
              styles.topBar,
              {paddingTop: Math.max(insets.top, 12) + 4},
            ]}
            pointerEvents="box-none">
            <Pressable
              style={styles.iconBtn}
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel={t.imageViewer.close}>
              <X size={22} color="#fff" />
            </Pressable>
            <View style={styles.topActions}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void handleSaveToPhotos()}
                disabled={saving}
                accessibilityLabel={t.imageViewer.save}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Download size={22} color="#fff" />
                )}
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void handleShare()}
                disabled={sharing}
                accessibilityLabel={t.imageViewer.share}>
                {sharing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Share2 size={22} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.bottomBar,
              {paddingBottom: Math.max(insets.bottom, 12) + 8},
            ]}>
            <Pressable
              style={styles.zoomBtn}
              onPress={zoomOut}
              accessibilityLabel={t.imageViewer.zoomOut}>
              <ZoomOut size={20} color="#fff" />
            </Pressable>
            <Text style={styles.zoomLabel}>
              {Math.round(scaleValue * 100)}%
            </Text>
            <Pressable
              style={styles.zoomBtn}
              onPress={zoomIn}
              accessibilityLabel={t.imageViewer.zoomIn}>
              <ZoomIn size={20} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
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
  flex: {flex: 1},
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinchHost: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
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
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    color: '#fff',
    fontSize: typography.subhead,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'center',
  },
});
