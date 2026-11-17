import { stat } from 'node:fs/promises';
import { musicTracks } from './public/music-library.js';

for (const track of musicTracks) {
  const path = track.id === 'circles' ? 'public/api/music.mp3' : `public/api/music-files/${track.id}.mp3`;
  let file;
  try { file = await stat(new URL(path, import.meta.url)); } catch {
    throw new Error(`음원이 빠져 있어 음원 서비스 배포를 중단합니다: ${path}`);
  }
  if (!file.isFile() || file.size === 0 || file.size > 25 * 1024 * 1024) {
    throw new Error(`음원 파일 크기를 확인해 주세요(0 초과, 최대 25 MiB): ${path}`);
  }
}
console.log(`음원 ${musicTracks.length}곡 확인 완료`);
