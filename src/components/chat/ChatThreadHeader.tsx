import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {
  ChevronLeft,
  MoreHorizontal,
  Pause,
  Play,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {ChannelIcon} from '../ChannelIcon';
import {brand, glassShadow, radii, spacing, typography} from '../../theme/tokens';
import {formatExternalId} from '../../utils/externalId';

export type ChatThreadHeaderProps = {
  title: string;
  subtitle?: string | null;
  /** URL do avatar (cliente / grupo) — paridade com ChatAvatar da web */
  avatarUrl?: string | null;
  channelType?: string | null;
  headerLoading?: boolean;
  status?: string | null;
  hasActiveFlow?: boolean;
  canStartFlow?: boolean;
  isAssignee?: boolean;
  isCollaborator?: boolean;
  canBecomeCollaborator?: boolean;
  isOwnerOrAdmin?: boolean;
  canResolve?: boolean;
  onBack: () => void;
  onAttend?: () => void;
  onPauseFlow?: () => void;
  onStartFlow?: () => void;
  onLeave?: () => void;
  onResolve?: () => void;
  onMore?: () => void;
  /** Toque no avatar/nome (ex.: abrir edição do cliente) */
  onPressProfile?: () => void;
};

function HeaderSkeleton({fill}: {fill: string}) {
  return (
    <View style={styles.titleBlock}>
      <View
        style={[styles.skeletonLine, styles.skeletonTitle, {backgroundColor: fill}]}
      />
      <View
        style={[
          styles.skeletonLine,
          styles.skeletonSubtitle,
          {backgroundColor: fill},
        ]}
      />
    </View>
  );
}

function HeaderAvatar({
  uri,
  name,
  channelType,
}: {
  uri?: string | null;
  name: string;
  channelType?: string | null;
}) {
  const {colors: theme} = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.avatarWrap}>
      {uri && !failed ? (
        <Image
          source={{uri}}
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            {backgroundColor: brand.blueSoft, borderColor: theme.border},
          ]}>
          <Text style={[styles.avatarLetter, {color: brand.blue}]}>{letter}</Text>
        </View>
      )}
      {channelType ? (
        <View style={styles.channelOverlay}>
          <ChannelIcon type={channelType} size={11} />
        </View>
      ) : null}
    </View>
  );
}

export function ChatThreadHeader({
  title,
  subtitle,
  avatarUrl,
  channelType,
  headerLoading = false,
  status,
  hasActiveFlow = false,
  canStartFlow = false,
  onBack,
  onPauseFlow,
  onStartFlow,
  onMore,
  onPressProfile,
}: ChatThreadHeaderProps) {
  const {colors: theme, theme: mode} = useTheme();
  const {t} = useI18n();

  const formattedSubtitle = subtitle ? formatExternalId(subtitle) : '';
  const showFlowControls =
    (status === 'pending' || status === 'in_progress') &&
    (hasActiveFlow || canStartFlow);

  const blurType =
    Platform.OS === 'ios'
      ? mode === 'dark'
        ? 'chromeMaterialDark'
        : 'chromeMaterialLight'
      : mode === 'dark'
        ? 'dark'
        : 'xlight';
  const glassTint =
    mode === 'dark' ? 'rgba(15,23,42,0.32)' : 'rgba(255,255,255,0.52)';
  const fallbackBg =
    mode === 'dark' ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.90)';

  const profileContent = headerLoading ? (
    <>
      <View style={[styles.avatarSkeleton, {backgroundColor: theme.fill}]} />
      <HeaderSkeleton fill={theme.fill} />
    </>
  ) : (
    <>
      <HeaderAvatar
        uri={avatarUrl}
        name={title || t.thread.conversation}
        channelType={channelType}
      />
      <View style={styles.titleBlock}>
        <Text style={[styles.title, {color: theme.label}]} numberOfLines={1}>
          {title || t.thread.conversation}
        </Text>
        {formattedSubtitle ? (
          <Text
            style={[styles.subtitle, {color: theme.secondaryLabel}]}
            numberOfLines={1}>
            {formattedSubtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.shell} pointerEvents="box-none">
      <View
        style={[
          styles.cardShadow,
          glassShadow(mode),
          {borderRadius: radii.xl},
        ]}>
        <View
          style={[
            styles.card,
            {
              borderColor:
                mode === 'dark'
                  ? 'rgba(59, 130, 246, 0.22)'
                  : 'rgba(229, 231, 235, 0.85)',
            },
          ]}
          collapsable={false}>
          <BlurView
            style={[StyleSheet.absoluteFill, {borderRadius: radii.xl}]}
            blurType={blurType}
            blurAmount={Platform.OS === 'ios' ? 18 : 10}
            {...(Platform.OS === 'android'
              ? {
                  overlayColor: glassTint,
                  downsampleFactor: 5,
                }
              : {})}
            reducedTransparencyFallbackColor={fallbackBg}
          />
          {Platform.OS === 'ios' ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: radii.xl,
                  backgroundColor: glassTint,
                },
              ]}
            />
          ) : null}

          <View style={styles.row}>
            <TouchableOpacity
              onPress={onBack}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t.thread.back}>
              <ChevronLeft size={22} color={theme.label} strokeWidth={2.25} />
            </TouchableOpacity>

            {onPressProfile && !headerLoading ? (
              <TouchableOpacity
                style={styles.center}
                onPress={onPressProfile}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={title || t.thread.conversation}>
                {profileContent}
              </TouchableOpacity>
            ) : (
              <View style={styles.center}>{profileContent}</View>
            )}

            <View style={styles.actions}>
              {headerLoading ? (
                <View
                  style={[
                    styles.actionSkeleton,
                    {backgroundColor: theme.fill},
                  ]}
                />
              ) : showFlowControls ? (
                hasActiveFlow ? (
                  <TouchableOpacity
                    onPress={onPauseFlow}
                    style={styles.iconBtn}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Pausar fluxo">
                    <Pause size={18} color={theme.label} strokeWidth={2.25} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={onStartFlow}
                    style={styles.iconBtn}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Iniciar fluxo">
                    <Play size={18} color={brand.blue} strokeWidth={2.25} />
                  </TouchableOpacity>
                )
              ) : null}

              {headerLoading ? (
                <View
                  style={[
                    styles.actionSkeleton,
                    {backgroundColor: theme.fill},
                  ]}
                />
              ) : onMore ? (
                <TouchableOpacity
                  onPress={onMore}
                  style={styles.iconBtn}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t.thread.actions}>
                  <MoreHorizontal
                    size={20}
                    color={theme.label}
                    strokeWidth={2.25}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  cardShadow: {
    borderRadius: radii.xl,
  },

  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    gap: 6,
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 1,
    fontSize: typography.caption,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSkeleton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
  },
  avatarWrap: {
    width: 40,
    height: 40,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: typography.headline,
    fontWeight: '700',
  },
  channelOverlay: {
    position: 'absolute',
    right: -2,
    bottom: -2,
  },
  avatarSkeleton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
  },
  skeletonLine: {
    borderRadius: radii.md,
  },
  skeletonTitle: {
    height: 14,
    width: '55%',
    marginBottom: 6,
  },
  skeletonSubtitle: {
    height: 10,
    width: '40%',
  },
});
