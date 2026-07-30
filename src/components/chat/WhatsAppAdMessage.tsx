import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {ExternalLink, Image as ImageIcon} from 'lucide-react-native';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ExternalAdReply} from './messageHelpers';

type Props = {
  adReply: ExternalAdReply;
  out?: boolean;
  sponsoredLabel: string;
  viewAdLabel: string;
};

export function WhatsAppAdMessage({
  adReply,
  out = false,
  sponsoredLabel,
  viewAdLabel,
}: Props) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const sourceUrl = adReply.sourceUrl || adReply.sourceURL;
  const imageUrl = useMemo(() => {
    if (adReply.thumbnailUrl || adReply.thumbnailURL) {
      return adReply.thumbnailUrl || adReply.thumbnailURL || null;
    }
    if (adReply.thumbnail) {
      return `data:image/png;base64,${adReply.thumbnail}`;
    }
    return null;
  }, [adReply.thumbnail, adReply.thumbnailUrl, adReply.thumbnailURL]);

  const openAdUrl = () => {
    if (!sourceUrl) return;
    void Linking.openURL(sourceUrl).catch(() => undefined);
  };

  const borderColor = out ? 'rgba(147, 197, 253, 0.7)' : 'rgba(209, 213, 219, 0.9)';
  const bgColor = out ? 'rgba(239, 246, 255, 0.9)' : 'rgba(255, 255, 255, 0.96)';
  const titleColor = out ? '#1E3A8A' : '#111827';
  const bodyColor = out ? '#1D4ED8' : '#4B5563';

  return (
    <Pressable
      onPress={sourceUrl ? openAdUrl : undefined}
      style={[styles.card, {borderColor, backgroundColor: bgColor}]}>
      {adReply.showAdAttribution ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{sponsoredLabel}</Text>
        </View>
      ) : null}

      {imageUrl && !imageError ? (
        <View style={styles.imageWrap}>
          {imageLoading ? (
            <View
              style={[
                styles.imagePlaceholder,
                adReply.renderLargerThumbnail && styles.imageLarge,
              ]}>
              <ActivityIndicator color={brand.blue} />
            </View>
          ) : null}
          <Image
            source={{uri: imageUrl}}
            style={[
              styles.image,
              adReply.renderLargerThumbnail && styles.imageLarge,
              imageLoading && styles.imageHidden,
            ]}
            resizeMode="cover"
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true);
              setImageLoading(false);
            }}
          />
          {adReply.mediaType ? (
            <View style={styles.mediaBadge}>
              <Text style={styles.mediaBadgeText}>{adReply.mediaType}</Text>
            </View>
          ) : null}
        </View>
      ) : imageUrl && imageError ? (
        <View
          style={[
            styles.imagePlaceholder,
            adReply.renderLargerThumbnail && styles.imageLarge,
          ]}>
          <ImageIcon size={28} color="#9CA3AF" />
        </View>
      ) : null}

      <View style={styles.content}>
        {adReply.title ? (
          <Text style={[styles.title, {color: titleColor}]} numberOfLines={3}>
            {adReply.title}
          </Text>
        ) : null}
        {adReply.body ? (
          <Text style={[styles.body, {color: bodyColor}]} numberOfLines={4}>
            {adReply.body}
          </Text>
        ) : null}
        {sourceUrl ? (
          <View style={styles.actionWrap}>
            <Pressable
              onPress={openAdUrl}
              style={({pressed}) => [
                styles.actionBtn,
                out ? styles.actionBtnOut : styles.actionBtnIn,
                pressed && styles.actionPressed,
              ]}>
              <ExternalLink
                size={12}
                color={out ? '#FFFFFF' : brand.blue}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.actionText,
                  {color: out ? '#FFFFFF' : brand.blue},
                ]}>
                {viewAdLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radii.md,
    borderWidth: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  banner: {
    backgroundColor: brand.blue,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: typography.caption,
    fontWeight: '600',
    textAlign: 'center',
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 128,
  },
  imageLarge: {
    height: 180,
  },
  imageHidden: {
    opacity: 0,
    height: 0,
  },
  imagePlaceholder: {
    width: '100%',
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 231, 235, 0.8)',
  },
  mediaBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mediaBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  content: {
    padding: spacing.sm,
    gap: 6,
  },
  title: {
    fontSize: typography.subhead,
    fontWeight: '700',
    lineHeight: 18,
  },
  body: {
    fontSize: typography.caption,
    lineHeight: 16,
  },
  actionWrap: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: 'rgba(209, 213, 219, 0.8)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionBtnOut: {
    backgroundColor: brand.blue,
  },
  actionBtnIn: {
    backgroundColor: 'rgba(239, 246, 255, 1)',
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionText: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
