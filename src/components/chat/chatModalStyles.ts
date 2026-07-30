import {StyleSheet} from 'react-native';
import {radii, spacing, typography} from '../../theme/tokens';

export const chatModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Cor vem do ChatSheetModal (fade separado). Aqui só layout.
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  /** @deprecated use <ChatSheet /> / ChatSheetModal wrapSheet */
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: 0,
    maxHeight: '94%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    flexShrink: 0,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  /**
   * Corpo rolável: preenche o espaço do sheet (altura definida)
   * para o gesto de scroll funcionar também no fundo vazio.
   */
  scroll: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexShrink: 0,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontSize: typography.callout,
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.body,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.footnote,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: typography.callout,
    flex: 1,
  },
  rowValue: {
    fontSize: typography.subhead,
    flex: 1.2,
    textAlign: 'right',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  chipText: {
    fontSize: typography.footnote,
    fontWeight: '500',
  },
  error: {
    fontSize: typography.footnote,
    marginBottom: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontSize: typography.subhead,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontSize: typography.callout,
    fontWeight: '500',
    flex: 1,
  },
  detailRow: {
    marginBottom: spacing.md,
  },
  detailLabel: {
    fontSize: typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.body,
  },
});
