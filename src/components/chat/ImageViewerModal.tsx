import React, {useCallback, useEffect, useRef, useState} from 'react';
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
} from 'react-native';
import {
  PinchGestureHandler,
  PanGestureHandler,
  TapGestureHandler,
  State,
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
const DISMISS_DISTANCE = 90;
/** Velocidade vertical (sem zoom) para fechar */
const DISMISS_VELOCITY = 900;

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

export function ImageViewerModal({visible, uri, onClose}: Props) {
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const {width: winW, height: winH} = useWindowDimensions();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scaleValue, setScaleValue] = useState(1);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const lastOffset = useRef({x: 0, y: 0});
  const pinchStartScale = useRef(1);
  const closingRef = useRef(false);

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const doubleTapRef = useRef(null);

  const resetTransform = useCallback(() => {
    lastScale.current = 1;
    lastOffset.current = {x: 0, y: 0};
    pinchStartScale.current = 1;
    closingRef.current = false;
    setScaleValue(1);
    scaleAnim.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    backdropOpacity.setValue(1);
  }, [scaleAnim, translateX, translateY, backdropOpacity]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setControlsVisible(true);
    setSaving(false);
    setSharing(false);
    resetTransform();
  }, [visible, uri, resetTransform]);

  const applyScale = (next: number, animated = true) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    lastScale.current = clamped;
    setScaleValue(clamped);
    if (animated) {
      Animated.spring(scaleAnim, {
        toValue: clamped,
        useNativeDriver: true,
        friction: 8,
        tension: 120,
      }).start();
    } else {
      scaleAnim.setValue(clamped);
    }
    if (clamped === 1) {
      lastOffset.current = {x: 0, y: 0};
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
      backdropOpacity.setValue(1);
    }
  };

  const dismissWithDrag = (fromY: number) => {
    if (closingRef.current) return;
    closingRef.current = true;
    hapticSelection();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: fromY > 0 ? winH : -winH,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
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
        friction: 8,
      }),
      Animated.spring(translateY, {
        toValue: lastOffset.current.y,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 140,
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

  const onPinchGestureEvent = (event: {
    nativeEvent: {scale: number; state?: number};
  }) => {
    const next = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, pinchStartScale.current * event.nativeEvent.scale),
    );
    scaleAnim.setValue(next);
  };

  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.BEGAN) {
      pinchStartScale.current = lastScale.current;
    }
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStartScale.current * event.nativeEvent.scale),
      );
      applyScale(next, false);
    }
  };

  const onPanGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    if (closingRef.current) return;
    const {translationX, translationY} = event.nativeEvent;
    const notZoomed = lastScale.current <= 1.05;

    if (notZoomed) {
      // Sem zoom: arrastar = gesto de sair (só vertical, segue o dedo)
      translateX.setValue(translationX * 0.15);
      translateY.setValue(translationY);
      const fade = Math.max(
        0.25,
        1 - Math.abs(translationY) / (winH * 0.45),
      );
      backdropOpacity.setValue(fade);
      if (Math.abs(translationY) > 24 && controlsVisible) {
        setControlsVisible(false);
      }
      return;
    }

    translateX.setValue(lastOffset.current.x + translationX);
    translateY.setValue(lastOffset.current.y + translationY);
  };

  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    if (closingRef.current) return;

    const {translationX, translationY, velocityY} = event.nativeEvent;
    const notZoomed = lastScale.current <= 1.05;

    if (notZoomed) {
      const shouldDismiss =
        Math.abs(translationY) > DISMISS_DISTANCE ||
        Math.abs(velocityY) > DISMISS_VELOCITY;

      if (shouldDismiss) {
        dismissWithDrag(translationY);
        return;
      }

      lastOffset.current = {x: 0, y: 0};
      translateX.setValue(0);
      translateY.setValue(0);
      snapBack();
      setControlsVisible(true);
      return;
    }

    lastOffset.current = {
      x: lastOffset.current.x + translationX,
      y: lastOffset.current.y + translationY,
    };
    translateX.setValue(lastOffset.current.x);
    translateY.setValue(lastOffset.current.y);
  };

  const onDoubleTap = (event: TapGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    hapticSelection();
    applyScale(lastScale.current > 1.05 ? 1 : 2.5);
  };

  const onSingleTap = (event: TapGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    setControlsVisible(v => !v);
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

  const imageW = winW;
  const imageH = winH * 0.72;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, {opacity: backdropOpacity}]}>
          <View style={styles.backdropFill} />
        </Animated.View>

        <TapGestureHandler
          waitFor={doubleTapRef}
          onHandlerStateChange={onSingleTap}>
          <Animated.View style={styles.flex}>
            <TapGestureHandler
              ref={doubleTapRef}
              numberOfTaps={2}
              onHandlerStateChange={onDoubleTap}>
              <Animated.View style={styles.flex}>
                <PanGestureHandler
                  ref={panRef}
                  simultaneousHandlers={pinchRef}
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanStateChange}
                  minPointers={1}
                  maxPointers={1}
                  avgTouches
                  activeOffsetY={[-12, 12]}
                  failOffsetX={scaleValue <= 1.05 ? [-40, 40] : undefined}>
                  <Animated.View style={styles.stage}>
                    <PinchGestureHandler
                      ref={pinchRef}
                      simultaneousHandlers={panRef}
                      onGestureEvent={onPinchGestureEvent}
                      onHandlerStateChange={onPinchStateChange}>
                      <Animated.View
                        style={[
                          styles.imageWrap,
                          {
                            transform: [
                              {translateX},
                              {translateY},
                              {scale: scaleAnim},
                            ],
                          },
                        ]}>
                        {loading ? (
                          <ActivityIndicator
                            color="#fff"
                            style={StyleSheet.absoluteFill}
                          />
                        ) : null}
                        <Image
                          source={{uri}}
                          style={{width: imageW, height: imageH}}
                          resizeMode="contain"
                          onLoadEnd={() => setLoading(false)}
                          onError={() => setLoading(false)}
                        />
                      </Animated.View>
                    </PinchGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
              </Animated.View>
            </TapGestureHandler>
          </Animated.View>
        </TapGestureHandler>

        {controlsVisible ? (
          <>
            <View
              style={[
                styles.topBar,
                {paddingTop: Math.max(insets.top, 12) + 4},
              ]}
              pointerEvents="box-none">
              <Pressable
                style={styles.iconBtn}
                onPress={onClose}
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
          </>
        ) : null}
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
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
