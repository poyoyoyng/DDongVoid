// Looping background music for signed-in players. Browsers refuse to start sound before the visitor
// interacts with the page, so a refused start is retried on the next click or key press.
const storageKey = 'ddongvoid-music';

function remembered() {
  try { return localStorage.getItem(storageKey) !== 'off'; } catch { return true; }
}

export function createMusic(button) {
  const audio = new Audio();
  audio.loop = true;
  audio.volume = .35;
  audio.preload = 'none';
  let enabled = remembered();
  let signedIn = false;
  let quiet = false;
  // Cleared when the track cannot be loaded, e.g. no file uploaded yet; the button then stays hidden.
  let available = true;

  const wanted = () => signedIn && available && enabled && !quiet;

  function render() {
    button.hidden = !signedIn || !available;
    button.textContent = enabled ? '🔊' : '🔇';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? '배경음악 끄기' : '배경음악 켜기';
  }

  function sync() {
    render();
    if (!wanted()) {
      audio.pause();
      return;
    }
    if (!audio.getAttribute('src')) audio.src = '/api/music';
    if (audio.paused) audio.play().catch(() => {});
  }

  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    available = false;
    audio.removeAttribute('src');
    sync();
  });
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, () => { if (wanted() && audio.paused) sync(); }, { capture: true });
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch {}
    sync();
  });

  return {
    // Called on every page change: music plays only for a signed-in player and pauses where it would get in the way.
    update(isSignedIn, isQuiet) {
      if (signedIn && !isSignedIn) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      if (!signedIn && isSignedIn) available = true;
      signedIn = isSignedIn;
      quiet = isQuiet;
      sync();
    },
  };
}
