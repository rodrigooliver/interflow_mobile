import {Platform, Vibration} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/**
 * Tick bem rápido no long-press (estilo WhatsApp).
 * impactLight / effectTick — não é vibração longa do motor.
 */
export function hapticLongPress() {
  try {
    ReactNativeHapticFeedback.trigger(
      Platform.OS === 'android' ? 'effectTick' : 'impactLight',
      options,
    );
  } catch {
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 8 : 1);
    } catch {
      // ignore
    }
  }
}

/** Micro-feedback ao tocar reação/ação no menu. */
export function hapticSelection() {
  try {
    ReactNativeHapticFeedback.trigger(
      Platform.OS === 'android' ? 'effectClick' : 'selection',
      options,
    );
  } catch {
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 5 : 1);
    } catch {
      // ignore
    }
  }
}
