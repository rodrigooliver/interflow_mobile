import {useCallback, useState} from 'react';
import {Alert} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import type {ChatAttachmentInput} from '../../../services/chatsApi';

export type PendingAttachment = ChatAttachmentInput & {
  id: string;
  kind: 'image' | 'file';
};

function mapPickerAsset(
  response: ImagePickerResponse,
  kind: 'image' | 'file',
): PendingAttachment[] {
  if (response.didCancel || response.errorCode) return [];
  const assets = response.assets || [];
  return assets
    .filter(a => a.uri)
    .map(a => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uri: a.uri!,
      type: a.type || 'image/jpeg',
      name: a.fileName || `image_${Date.now()}.jpg`,
      kind,
    }));
}

export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const addAttachments = useCallback((items: PendingAttachment[]) => {
    if (!items.length) return;
    setAttachments(prev => [...prev, ...items].slice(0, 10));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const restoreAttachments = useCallback((items: PendingAttachment[]) => {
    setAttachments(items);
  }, []);

  const pickFromGallery = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 5,
        quality: 0.8,
      });
      addAttachments(mapPickerAsset(res, 'image'));
    } catch (e) {
      console.warn('[Composer] gallery failed', e);
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  }, [addAttachments]);

  const pickFromCamera = useCallback(async () => {
    try {
      const res = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: false,
      });
      addAttachments(mapPickerAsset(res, 'image'));
    } catch (e) {
      console.warn('[Composer] camera failed', e);
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  }, [addAttachments]);

  const pickFromFiles = useCallback(async () => {
    try {
      const results = await DocumentPicker.pick({
        allowMultiSelection: true,
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const mapped: PendingAttachment[] = results.map(doc => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: doc.fileCopyUri || doc.uri,
        type: doc.type || 'application/octet-stream',
        name: doc.name || `file_${Date.now()}`,
        kind: 'file',
      }));
      addAttachments(mapped);
    } catch (e) {
      if (DocumentPicker.isCancel(e)) return;
      console.warn('[Composer] document picker failed', e);
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo.');
    }
  }, [addAttachments]);

  return {
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    restoreAttachments,
    pickFromGallery,
    pickFromCamera,
    pickFromFiles,
  };
}
