import React from 'react';
import EmojiPicker, {
  type EmojiType,
  en as emojiEn,
  es as emojiEs,
  pt as emojiPt,
} from 'rn-emoji-keyboard';
import {useI18n} from '../../contexts/I18nContext';
import {useTheme} from '../../contexts/ThemeContext';
import {useEmojiRecentPersistence} from '../../hooks/useEmojiRecentPersistence';
import {brand} from '../../theme/tokens';

type Props = {
  open: boolean;
  onClose: () => void;
  onEmojiSelected: (emoji: string) => void;
};

/** Teclado completo de emoji (modal bottom) — montar fora de outros Modals. */
export function ChatEmojiPicker({open, onClose, onEmojiSelected}: Props) {
  const {locale} = useI18n();
  const {theme: mode, colors: theme} = useTheme();

  useEmojiRecentPersistence();

  const translation =
    locale === 'es' ? emojiEs : locale === 'en' ? emojiEn : emojiPt;

  const handleSelect = (emoji: EmojiType) => {
    onEmojiSelected(emoji.emoji);
  };

  return (
    <EmojiPicker
      open={open}
      onClose={onClose}
      onEmojiSelected={handleSelect}
      enableSearchBar
      enableRecentlyUsed
      categoryPosition="top"
      translation={translation}
      theme={
        mode === 'dark'
          ? {
              backdrop: '#00000088',
              knob: theme.separator,
              container: '#1F2937',
              header: theme.label,
              skinTonesContainer: theme.fill,
              category: {
                icon: theme.secondaryLabel,
                iconActive: brand.blue,
                container: '#1F2937',
                containerActive: theme.fill,
              },
              search: {
                background: theme.fill,
                text: theme.label,
                placeholder: theme.secondaryLabel,
                icon: theme.secondaryLabel,
              },
              emoji: {
                selected: theme.fill,
              },
            }
          : undefined
      }
      categoryOrder={[
        'recently_used',
        'smileys_emotion',
        'people_body',
        'animals_nature',
        'food_drink',
        'travel_places',
        'activities',
        'objects',
        'symbols',
        'flags',
      ]}
    />
  );
}
