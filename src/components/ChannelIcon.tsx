import React from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Path, Circle, Defs, LinearGradient, Stop, Rect} from 'react-native-svg';
import {useTheme} from '../contexts/ThemeContext';

type Props = {
  type?: string | null;
  size?: number;
};

/** Logos alinhados a `getChannelIcon` da web (public/images/logos). */
export function ChannelIcon({type, size = 14}: Props) {
  const {theme: mode} = useTheme();
  const isDark = mode === 'dark';

  return (
    <View
      style={[
        styles.badge,
        {
          width: size + 6,
          height: size + 6,
          backgroundColor: isDark
            ? 'rgba(31, 41, 55, 0.95)'
            : '#FFFFFF',
          borderColor: isDark
            ? 'rgba(156, 163, 175, 0.35)'
            : 'rgba(0,0,0,0.12)',
          shadowColor: isDark ? '#000000' : '#111827',
        },
      ]}>
      {renderIcon(type, size)}
    </View>
  );
}

function renderIcon(type: string | null | undefined, size: number) {
  switch (type) {
    case 'whatsapp_official':
    case 'whatsapp_wapi':
    case 'whatsapp_waha':
    case 'whatsapp_zapi':
    case 'whatsapp_evo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            fill="#25D366"
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
          />
        </Svg>
      );
    case 'instagram':
    case 'instagramId':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor="#f09433" />
              <Stop offset="0.45" stopColor="#e6683c" />
              <Stop offset="1" stopColor="#bc1888" />
            </LinearGradient>
          </Defs>
          <Rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig)" />
          <Circle
            cx="12"
            cy="12"
            r="4.2"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
          />
          <Circle cx="17.2" cy="6.8" r="1.2" fill="#fff" />
        </Svg>
      );
    case 'facebook':
    case 'facebookId':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="12" fill="#0866FF" />
          <Path
            fill="#fff"
            d="M13.5 8.2h-1c-.5 0-.8.3-.8.9v1.1H14l-.2 1.9h-1.5V18h-2.1v-5.9H9v-1.9h1.2V9.3c0-1.7 1-2.6 2.6-2.6.5 0 1.1.1 1.5.2l-.1 1.3h-.7z"
          />
        </Svg>
      );
    case 'telegram':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Defs>
            <LinearGradient id="tg" x1="16" y1="2" x2="16" y2="30">
              <Stop offset="0" stopColor="#37BBFE" />
              <Stop offset="1" stopColor="#007DBB" />
            </LinearGradient>
          </Defs>
          <Circle cx="16" cy="16" r="14" fill="url(#tg)" />
          <Path
            fill="#fff"
            d="M22.9866 10.2088C23.1112 9.40332 22.3454 8.76755 21.6292 9.082L7.36482 15.3448C6.85123 15.5703 6.8888 16.3483 7.42147 16.5179L10.3631 17.4547C10.9246 17.6335 11.5325 17.541 12.0228 17.2023L18.655 12.6203C18.855 12.4821 19.073 12.7665 18.9021 12.9426L14.1281 17.8646C13.665 18.3421 13.7569 19.1512 14.314 19.5005L19.659 22.8523C20.2585 23.2282 21.0297 22.8506 21.1418 22.1261L22.9866 10.2088Z"
          />
        </Svg>
      );
    case 'email':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="12" fill="#EA4335" />
          <Path
            fill="#fff"
            d="M6.2 8.4h11.6c.4 0 .7.3.7.7v6.8c0 .4-.3.7-.7.7H6.2c-.4 0-.7-.3-.7-.7V9.1c0-.4.3-.7.7-.7zm5.8 4.2 5.1-3.4H7l5 3.4zm0 1.3-5.2-3.5v5.5h10.4v-5.5L12 13.9z"
          />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            fill="#25D366"
            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
          />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    // leve destaque sobre o avatar
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
