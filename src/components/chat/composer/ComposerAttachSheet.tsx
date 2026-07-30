import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import {Camera, Image as ImageIcon, FileText, X} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useI18n} from '../../../contexts/I18nContext';
import {brand, glassShadow, radii, spacing, typography} from '../../../theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickGallery: () => void;
  onPickCamera: () => void;
  onPickFiles: () => void;
};

export function ComposerAttachSheet({
  visible,
  onClose,
  onPickGallery,
  onPickCamera,
  onPickFiles,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t} = useI18n();

  const run = (fn: () => void) => {
    onClose();
    // Deixa o modal fechar antes de abrir o picker nativo
    setTimeout(fn, 180);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            glassShadow(mode),
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}
          onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[styles.title, {color: theme.label}]}>
              {t.composer.attachTitle}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color={theme.tertiaryLabel} />
            </TouchableOpacity>
          </View>

          <Option
            icon={<ImageIcon size={20} color={brand.blue} />}
            label={t.composer.gallery}
            onPress={() => run(onPickGallery)}
            theme={theme}
          />
          <Option
            icon={<Camera size={20} color={brand.blue} />}
            label={t.composer.camera}
            onPress={() => run(onPickCamera)}
            theme={theme}
          />
          <Option
            icon={<FileText size={20} color={brand.blue} />}
            label={t.composer.files}
            onPress={() => run(onPickFiles)}
            theme={theme}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({
  icon,
  label,
  onPress,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  theme: {fill: string; label: string; border: string};
}) {
  return (
    <TouchableOpacity
      style={[styles.option, {backgroundColor: theme.fill, borderColor: theme.border}]}
      onPress={onPress}
      activeOpacity={0.75}>
      <View style={styles.optionIcon}>{icon}</View>
      <Text style={[styles.optionLabel, {color: theme.label}]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  sheet: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: spacing.md,
    gap: 10,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '600',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  optionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: typography.body,
    fontWeight: '500',
  },
});
