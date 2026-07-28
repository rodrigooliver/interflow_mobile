import {
  NativeModules,
  PermissionsAndroid,
  Platform,
  Share,
  TurboModuleRegistry,
  type ShareContent,
} from 'react-native';

export type SaveImageResult =
  | 'saved'
  | 'cancelled'
  | 'error'
  | 'unavailable'
  | 'permission_denied';

type CameraRollNative = {
  saveToCameraRoll: (
    uri: string,
    options: {type?: string; album?: string},
  ) => Promise<unknown>;
};

function getCameraRollModule(): CameraRollNative | null {
  try {
    const turbo = TurboModuleRegistry.get('RNCCameraRoll') as
      | CameraRollNative
      | null;
    if (turbo?.saveToCameraRoll) return turbo;
  } catch {
    // ignore
  }
  const legacy = NativeModules.RNCCameraRoll as CameraRollNative | undefined;
  return legacy?.saveToCameraRoll ? legacy : null;
}

function guessExtension(uri: string): string {
  const clean = uri.split('?')[0]?.toLowerCase() || '';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.gif')) return 'gif';
  if (clean.endsWith('.heic') || clean.endsWith('.heif')) return 'heic';
  return 'jpg';
}

function isRemoteUri(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

async function ensureAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (api >= 29) return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const btoaFn = (
    globalThis as typeof globalThis & {btoa?: (data: string) => string}
  ).btoa;
  if (!btoaFn) throw new Error('btoa unavailable');
  return btoaFn(binary);
}

/**
 * Baixa URL remota (ex.: Supabase signed) para arquivo local.
 * Photos no iOS NÃO aceita https — precisa de file:// (erro 3302).
 */
async function downloadToCache(uri: string): Promise<string> {
  if (!NativeModules.RNFSManager) {
    throw new Error('RNFS unavailable — rebuild the native app');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNFS = require('react-native-fs') as typeof import('react-native-fs');
  const ext = guessExtension(uri);
  const dest = `${RNFS.CachesDirectoryPath}/interflow-${Date.now()}.${ext}`;

  try {
    const result = await RNFS.downloadFile({
      fromUrl: uri,
      toFile: dest,
    }).promise;
    if (result.statusCode && result.statusCode >= 400) {
      throw new Error(`download HTTP ${result.statusCode}`);
    }
  } catch (downloadError) {
    // Fallback: fetch + write (melhor com signed URLs / redirects)
    console.warn('[saveImage] downloadFile failed, using fetch', downloadError);
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    await RNFS.writeFile(dest, base64, 'base64');
  }

  const exists = await RNFS.exists(dest);
  if (!exists) {
    throw new Error('downloaded file missing');
  }

  return dest.startsWith('file://') ? dest : `file://${dest}`;
}

async function toShareableImageUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:') || uri.startsWith('file://')) return uri;

  try {
    return await downloadToCache(uri);
  } catch {
    // data URI como último recurso no Share
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    `image/${guessExtension(uri) === 'jpg' ? 'jpeg' : guessExtension(uri)}`;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error('image_too_large');
  }
  return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
}

/** Salva direto na galeria (Fotos). */
export async function saveImageToGallery(uri: string): Promise<SaveImageResult> {
  if (!uri) return 'error';

  try {
    const allowed = await ensureAndroidPermission();
    if (!allowed) return 'permission_denied';

    const mod = getCameraRollModule();
    if (!mod) {
      console.error('[saveImage] RNCCameraRoll not in native binary');
      return 'unavailable';
    }

    // iOS/Android: Photos só aceita arquivo local — baixar signed URLs antes
    const tag = isRemoteUri(uri) ? await downloadToCache(uri) : uri;

    await mod.saveToCameraRoll(tag, {type: 'photo', album: ''});
    return 'saved';
  } catch (e) {
    console.error('[saveImage] gallery save failed', e);
    return 'error';
  }
}

/** Abre o Share nativo (WhatsApp, AirDrop, etc.). */
export async function shareImage(uri: string): Promise<SaveImageResult> {
  if (!uri) return 'error';

  try {
    let shareUrl = uri;
    try {
      shareUrl = await toShareableImageUrl(uri);
    } catch (prepError) {
      console.warn('[saveImage] share prep failed, using original URL', prepError);
      shareUrl = uri;
    }

    const content: ShareContent =
      Platform.OS === 'ios'
        ? {url: shareUrl}
        : shareUrl.startsWith('http')
          ? {message: shareUrl, title: 'Image'}
          : {url: shareUrl, message: '', title: 'Image'};

    const result = await Share.share(content);
    if (result.action === Share.dismissedAction) return 'cancelled';
    return 'saved';
  } catch (e) {
    console.error('[saveImage] share failed', e);
    return 'error';
  }
}
