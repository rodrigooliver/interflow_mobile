import {Linking, NativeModules, Platform, Share} from 'react-native';
import type {
  DownloadableKind,
  DownloadableMedia,
} from '../components/chat/messageHelpers';
import {saveMediaToGallery} from './saveImage';

export type DownloadMediaResult =
  /** Foto/vídeo entrou na galeria do sistema. */
  | 'saved_gallery'
  /** Arquivo gravado na pasta Downloads (Android). */
  | 'saved_file'
  /** Share sheet concluído (iOS: "Salvar em Arquivos"). */
  | 'shared'
  /** Delegado ao gerenciador de downloads do sistema. */
  | 'opened'
  | 'cancelled'
  | 'permission_denied'
  | 'unavailable'
  | 'error';

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const FALLBACK_EXTENSION: Record<DownloadableKind, string> = {
  image: 'jpg',
  video: 'mp4',
  audio: 'mp3',
  file: 'bin',
};

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extensionFromPath(value: string): string | null {
  const clean = value.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-z0-9]{1,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

function extensionFromMime(mime?: string | null): string | null {
  if (!mime) return null;
  const normalized = mime.split(';')[0].trim().toLowerCase();
  return MIME_EXTENSIONS[normalized] || null;
}

/** Nome final do arquivo, sempre com extensão — o iOS depende dela no share. */
export function buildDownloadFileName(media: DownloadableMedia): string {
  const rawName = sanitizeFileName(media.name || '');
  const extension =
    extensionFromPath(rawName) ||
    extensionFromMime(media.mimeType) ||
    extensionFromPath(media.url) ||
    FALLBACK_EXTENSION[media.kind];

  const base =
    rawName.replace(/\.[a-z0-9]{1,5}$/i, '').slice(0, 80).trim() ||
    `interflow-${Date.now()}`;

  return `${base}.${extension}`;
}

function getRNFS(): typeof import('react-native-fs') | null {
  if (!NativeModules.RNFSManager) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-fs') as typeof import('react-native-fs');
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const RNFS = getRNFS();
  if (!RNFS) throw new Error('RNFS unavailable');

  const result = await RNFS.downloadFile({fromUrl: url, toFile: dest}).promise;
  if (result.statusCode && result.statusCode >= 400) {
    throw new Error(`download HTTP ${result.statusCode}`);
  }
  const exists = await RNFS.exists(dest);
  if (!exists) throw new Error('downloaded file missing');
}

/**
 * Áudio/documento não cabem na galeria:
 * Android grava em Downloads (com fallback no gerenciador do sistema),
 * iOS baixa para o cache e abre o share sheet.
 */
async function downloadAsFile(
  url: string,
  fileName: string,
): Promise<DownloadMediaResult> {
  const RNFS = getRNFS();
  if (!RNFS) return 'unavailable';

  if (Platform.OS === 'android') {
    try {
      const dest = `${RNFS.DownloadDirectoryPath}/${fileName}`;
      await downloadToFile(url, dest);
      await RNFS.scanFile(dest).catch(() => undefined);
      return 'saved_file';
    } catch (e) {
      console.warn('[downloadMedia] Downloads write failed, delegating', e);
      try {
        await Linking.openURL(url);
        return 'opened';
      } catch {
        return 'error';
      }
    }
  }

  const dest = `${RNFS.CachesDirectoryPath}/${fileName}`;
  await downloadToFile(url, dest);
  const result = await Share.share({url: `file://${dest}`});
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

/** Baixa o anexo da mensagem para o dispositivo. */
export async function downloadMessageMedia(
  media: DownloadableMedia,
): Promise<DownloadMediaResult> {
  if (!media.url) return 'error';

  try {
    if (media.kind === 'image' || media.kind === 'video') {
      const galleryResult = await saveMediaToGallery(
        media.url,
        media.kind === 'image' ? 'photo' : 'video',
      );
      if (galleryResult === 'saved') return 'saved_gallery';
      if (galleryResult === 'permission_denied') return 'permission_denied';
      // Formatos que a galeria recusa (ex.: sticker webp) caem no fluxo de arquivo
    }

    return await downloadAsFile(media.url, buildDownloadFileName(media));
  } catch (e) {
    console.error('[downloadMedia] failed', e);
    return 'error';
  }
}
