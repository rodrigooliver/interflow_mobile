import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {MessageSquarePlus, RefreshCw, UserPlus} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChannelFeatures} from '../../utils/channelFeatures';
import {ChatThreadFooterSkeleton} from '../Skeleton';

export type ChatThreadFooterProps = {
  status?: string | null;
  canSendMessage?: boolean;
  canInteract?: boolean;
  /** Equivalente a canSendMessages() na web — colaborador com permissão de envio. */
  canSendAsCollaborator?: boolean;
  isGroupChat?: boolean;
  channelFeatures: ChannelFeatures;
  footerLoading?: boolean;
  isReservedForOther?: boolean;
  canBecomeCollaborator?: boolean;
  isOwnerOrAdmin?: boolean;
  attending?: boolean;
  joining?: boolean;
  transferring?: boolean;
  reopening?: boolean;
  onAttend?: () => void;
  onJoin?: () => void;
  onTransferToMe?: () => void;
  onOpenTemplate?: () => void;
  onReopen?: () => void;
  children?: React.ReactNode;
};

export function getThreadFooterMode(props: ChatThreadFooterProps) {
  const {
    status,
    canSendMessage = true,
    canInteract = true,
    canSendAsCollaborator = false,
    isGroupChat = false,
    footerLoading = false,
    isReservedForOther = false,
    canBecomeCollaborator = false,
    isOwnerOrAdmin = false,
  } = props;

  const showFloatingMessageInput =
    status === 'in_progress' &&
    canSendMessage &&
    (canInteract || canSendAsCollaborator);

  const showCollaboratorFooter =
    status === 'in_progress' &&
    !canInteract &&
    !canSendAsCollaborator &&
    !isGroupChat;

  const show24HourFooter =
    status === 'in_progress' && !canSendMessage && canInteract;

  const showPendingFooter = status === 'pending';

  const showClosedFooter =
    status === 'closed' || status === 'await_closing';

  const showPendingAttendOnly =
    showPendingFooter && !isReservedForOther;

  const showCollaboratorWithActions =
    showCollaboratorFooter && (canBecomeCollaborator || isOwnerOrAdmin);

  return {
    footerLoading,
    showFloatingMessageInput,
    showCollaboratorFooter,
    show24HourFooter,
    showPendingFooter,
    showClosedFooter,
    showPendingAttendOnly,
    showCollaboratorWithActions,
  };
}

export function ChatThreadFooter(props: ChatThreadFooterProps) {
  const {colors: theme} = useTheme();
  const {
    channelFeatures,
    footerLoading = false,
    isReservedForOther = false,
    attending = false,
    joining = false,
    transferring = false,
    reopening = false,
    onAttend,
    onJoin,
    onTransferToMe,
    onOpenTemplate,
    onReopen,
    children,
  } = props;

  const mode = getThreadFooterMode(props);

  if (footerLoading) {
    return <ChatThreadFooterSkeleton />;
  }

  if (mode.showPendingFooter) {
    return (
      <View style={[styles.shell, {backgroundColor: theme.pageBg}]}>
        {isReservedForOther ? (
          <View
            style={[
              styles.card,
              styles.amberCard,
              {backgroundColor: brand.amberSoft, borderColor: theme.borderPinned},
            ]}>
            <Text style={[styles.cardText, {color: theme.label}]}>
              Este chat está reservado para outro atendente.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onAttend}
            disabled={attending}
            style={[styles.primaryBtn, attending && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Atender">
            {attending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Atender</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (mode.showCollaboratorFooter) {
    return (
      <View style={[styles.shell, {backgroundColor: theme.pageBg}]}>
        {mode.showCollaboratorWithActions ? (
          <View
            style={[
              styles.card,
              styles.blueCard,
              {backgroundColor: brand.blueSoft, borderColor: theme.borderStrong},
            ]}>
            <Text style={[styles.cardText, {color: theme.label}]}>
              Você não pode interagir neste atendimento.
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={onJoin}
                disabled={joining}
                style={[styles.inlinePrimary, joining && styles.btnDisabled]}>
                {joining ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <UserPlus size={16} color="#FFFFFF" />
                    <Text style={styles.inlinePrimaryText}>Participar</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onTransferToMe}
                disabled={transferring}
                style={[
                  styles.inlineSecondary,
                  {borderColor: theme.border, backgroundColor: theme.card},
                  transferring && styles.btnDisabled,
                ]}>
                {transferring ? (
                  <ActivityIndicator color={brand.blue} size="small" />
                ) : (
                  <>
                    <RefreshCw size={16} color={brand.blue} />
                    <Text style={[styles.inlineSecondaryText, {color: brand.blue}]}>
                      Transferir p/ mim
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              styles.blueCard,
              {backgroundColor: brand.blueSoft, borderColor: theme.borderStrong},
            ]}>
            <Text style={[styles.cardText, {color: theme.label}]}>
              Você não pode interagir neste atendimento.
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (mode.show24HourFooter) {
    return (
      <View style={[styles.shell, {backgroundColor: theme.pageBg}]}>
        {channelFeatures.canSendTemplates ? (
          <View
            style={[
              styles.card,
              styles.amberCard,
              {backgroundColor: brand.amberSoft, borderColor: theme.borderPinned},
            ]}>
            <Text style={[styles.cardText, {color: theme.label}]}>
              A janela de 24 horas expirou. Envie um template para retomar a conversa.
            </Text>
            <TouchableOpacity
              onPress={onOpenTemplate}
              style={styles.inlinePrimary}
              accessibilityRole="button"
              accessibilityLabel="Usar template">
              <MessageSquarePlus size={16} color="#FFFFFF" />
              <Text style={styles.inlinePrimaryText}>Usar template</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              styles.amberCard,
              {backgroundColor: brand.amberSoft, borderColor: theme.borderPinned},
            ]}>
            <Text style={[styles.cardText, {color: theme.label}]}>
              A janela de 24 horas expirou. Não é possível enviar novas mensagens.
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (mode.showClosedFooter) {
    return (
      <View style={[styles.shell, {backgroundColor: theme.pageBg}]}>
        <View
          style={[
            styles.card,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          <Text style={[styles.cardText, {color: theme.secondaryLabel}]}>
            ✓ Chat encerrado
          </Text>
          <TouchableOpacity
            onPress={onReopen}
            disabled={reopening}
            style={[styles.inlinePrimary, reopening && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Reabrir chat">
            {reopening ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.inlinePrimaryText}>Reabrir chat</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode.showFloatingMessageInput) {
    return <>{children}</>;
  }

  return null;
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  amberCard: {},
  blueCard: {},
  cardText: {
    fontSize: typography.subhead,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: brand.blue,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: typography.callout,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlinePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.blue,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  inlinePrimaryText: {
    color: '#FFFFFF',
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  inlineSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  inlineSecondaryText: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
