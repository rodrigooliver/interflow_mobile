import AsyncStorage from '@react-native-async-storage/async-storage';
import {useRecentPicksPersistence} from 'rn-emoji-keyboard';

const STORAGE_KEY = '@interflow/emoji-recent-picks';

/** Persiste emojis frequentes/recentes do teclado. */
export function useEmojiRecentPersistence() {
  useRecentPicksPersistence({
    initialization: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    onStateChange: async next => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
  });
}
