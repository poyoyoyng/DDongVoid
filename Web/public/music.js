import { musicTracks } from './music-library.js';

const storageKey = 'ddongvoid-music';
const volumeGain = .2;
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}
function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

export function createMusic(player) {
  const audio = new Audio();
  audio.preload = 'metadata';
  const savedVolume = read(storageKey + '-volume');
  let volumeLevel = savedVolume !== null && Number.isFinite(Number(savedVolume))
    ? Math.max(0, Math.min(1, Number(savedVolume))) : .5;
  audio.volume = volumeLevel * volumeGain;
  let index = Math.max(0, musicTracks.findIndex(track => track.id === read(storageKey + '-track')));
  let enabled = read(storageKey) !== 'off';
  let signedIn = false;
  let quiet = false;
  let failed = false;
  let loading = false;
  let attempting = false;
  let revision = 0;
  let duration = 0;
  let seekPreview = null;
  const title = player.querySelector('#music-title');
  const artist = player.querySelector('#music-artist');
  const position = player.querySelector('#music-position');
  const status = player.querySelector('#music-status');
  const play = player.querySelector('#music-play');
  const pause = player.querySelector('#music-pause');
  const next = player.querySelector('#music-next');
  const volume = player.querySelector('#music-volume');
  const volumeValue = player.querySelector('#music-volume-value');
  const seek = player.querySelector('#music-seek');
  const elapsed = player.querySelector('#music-elapsed');
  const totalTime = player.querySelector('#music-duration');
  const list = player.querySelector('#music-tracks');
  player.querySelector('#music-count').textContent = musicTracks.length + '곡';
  const trackButtons = musicTracks.map((track, trackIndex) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-track';
    const number = document.createElement('span');
    number.className = 'music-track-number';
    number.textContent = String(trackIndex + 1).padStart(2, '0');
    const info = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = track.title;
    const singer = document.createElement('span');
    singer.className = 'music-artist';
    singer.textContent = track.artist;
    info.append(name, singer);
    button.append(number, info);
    button.addEventListener('click', () => choose(trackIndex));
    item.append(button);
    list.append(item);
    return button;
  });
  const wanted = () => signedIn && enabled && !quiet && !failed;

  function renderProgress() {
    const current = duration > 0 ? Math.max(0, Math.min(duration, seekPreview ?? audio.currentTime)) : 0;
    elapsed.textContent = clock(current);
    totalTime.textContent = duration > 0 ? clock(duration) : '--:--';
    seek.max = String(duration);
    seek.value = String(current);
    seek.disabled = !signedIn || quiet || failed || duration <= 0;
    seek.setAttribute('aria-valuetext', `${elapsed.textContent} / ${totalTime.textContent}`);
  }

  function render() {
    const track = musicTracks[index];
    title.textContent = track.title;
    artist.textContent = track.artist;
    position.textContent = `${index + 1} / ${musicTracks.length}`;
    const playing = wanted() && !audio.paused;
    player.classList.toggle('is-playing', playing && !loading);
    play.disabled = !signedIn || quiet || (playing && !failed);
    pause.disabled = !signedIn || !enabled || quiet;
    next.disabled = !signedIn || quiet;
    volume.value = String(Math.round(volumeLevel * 100));
    volumeValue.textContent = volume.value + '%';
    volume.setAttribute('aria-valuetext', volumeValue.textContent);
    renderProgress();
    for (const [trackIndex, button] of trackButtons.entries()) {
      button.disabled = !signedIn || quiet;
      button.setAttribute('aria-current', String(trackIndex === index));
    }
    status.textContent = !signedIn ? '로그인하면 음악을 재생할 수 있어요.'
      : quiet ? '키보드 리듬을 하는 동안에는 BGM을 쉬어 갑니다.'
      : failed ? '이 곡을 불러오지 못했어요. 시작을 다시 누르거나 다음 곡을 골라 주세요.'
      : !enabled ? '일시정지 · 시작을 누르면 이어서 재생해요.'
      : loading ? '음악을 불러오는 중…'
      : playing ? '재생 중 · 마지막 곡이 끝나면 처음부터 이어집니다.'
      : '시작을 누르면 음악이 재생됩니다.';
  }

  function sync() {
    const src = '/api/music/' + musicTracks[index].id;
    if (signedIn && !failed && audio.getAttribute('src') !== src) {
      revision++;
      attempting = false;
      loading = enabled && !quiet;
      duration = 0;
      seekPreview = null;
      audio.src = src;
    }
    if (!wanted()) {
      audio.pause();
      render();
      return;
    }
    if (audio.paused && !attempting) {
      attempting = true;
      const attempt = revision;
      Promise.resolve(audio.play()).then(() => {
        if (attempt !== revision) return;
        attempting = false;
        if (!wanted()) audio.pause();
        render();
      }).catch(error => {
        if (attempt !== revision) return;
        attempting = false;
        loading = false;
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') failed = true;
        render();
      });
    }
    render();
  }

  function choose(trackIndex) {
    if (!signedIn || quiet) return;
    index = trackIndex;
    failed = false;
    enabled = true;
    remember(storageKey + '-track', musicTracks[index].id);
    remember(storageKey, 'on');
    sync();
  }
  play.addEventListener('click', () => {
    if (!signedIn || quiet) return;
    if (failed) {
      revision++;
      attempting = false;
      audio.removeAttribute('src');
      audio.load();
    }
    failed = false;
    enabled = true;
    remember(storageKey, 'on');
    sync();
  });
  pause.addEventListener('click', () => {
    enabled = false;
    remember(storageKey, 'off');
    sync();
  });
  next.addEventListener('click', () => choose((index + 1) % musicTracks.length));
  volume.addEventListener('input', () => {
    volumeLevel = Number(volume.value) / 100;
    audio.volume = volumeLevel * volumeGain;
    remember(storageKey + '-volume', volumeLevel);
    render();
  });
  seek.addEventListener('input', () => {
    if (seek.disabled) return;
    const value = Number(seek.value);
    if (!Number.isFinite(value)) return;
    seekPreview = Math.max(0, Math.min(duration, value));
    renderProgress();
  });
  seek.addEventListener('change', () => {
    const value = seekPreview ?? Number(seek.value);
    seekPreview = null;
    if (!seek.disabled && Number.isFinite(value)) {
      audio.currentTime = Math.max(0, Math.min(duration, value));
    }
    renderProgress();
  });
  seek.addEventListener('pointercancel', () => { seekPreview = null; renderProgress(); });
  for (const event of ['loadedmetadata', 'durationchange']) {
    audio.addEventListener(event, () => {
      duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      renderProgress();
    });
  }
  audio.addEventListener('timeupdate', renderProgress);
  audio.addEventListener('emptied', () => { duration = 0; seekPreview = null; renderProgress(); });
  audio.addEventListener('ended', () => {
    if (wanted()) choose((index + 1) % musicTracks.length);
  });
  audio.addEventListener('waiting', () => { loading = true; render(); });
  for (const event of ['playing', 'canplay']) {
    audio.addEventListener(event, () => { loading = false; render(); });
  }
  audio.addEventListener('pause', render);
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    failed = true;
    loading = false;
    sync();
  });
  for (const event of ['pointerdown', 'keydown']) {
    document.addEventListener(event, input => {
      if (!player.contains(input.target) && wanted() && audio.paused) sync();
    }, { capture: true });
  }
  render();
  return {
    update(isSignedIn, isQuiet) {
      if (signedIn && !isSignedIn) {
        revision++;
        attempting = false;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        loading = false;
        duration = 0;
        seekPreview = null;
      }
      if (!signedIn && isSignedIn) failed = false;
      signedIn = isSignedIn;
      quiet = isQuiet;
      sync();
    },
  };
}
