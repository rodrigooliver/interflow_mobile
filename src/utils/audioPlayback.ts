type Listener = (activeUrl: string | null) => void;

let activeUrl: string | null = null;
const listeners = new Set<Listener>();

export function getActiveAudioUrl(): string | null {
  return activeUrl;
}

export function setActiveAudioUrl(url: string | null) {
  activeUrl = url;
  listeners.forEach(l => l(activeUrl));
}

export function subscribeActiveAudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
