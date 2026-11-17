# 배경음악 보관·배포 규칙

## 재발 방지를 위한 필수 규칙

- 사이트와 음원은 서로 다른 Worker에 배포한다. 일반 기능 수정·푸시에는 사이트만 배포한다.
- 사이트 Worker `ddongvoid`는 `wrangler.jsonc`를 사용한다. 음원을 읽는 `MUSIC_ASSETS` 서비스 바인딩을 유지한다.
- 음원 Worker `ddongvoid-music-assets`는 `wrangler.music.jsonc`를 사용한다. 사이트의 Workers Builds 자동 배포를 이 Worker에 연결하지 않는다.
- `npm run deploy`에 `deploy:music`를 추가하지 않는다. 음원 추가·교체 요청이 있을 때만 `npm run deploy:music`를 실행한다.
- `public/.assetsignore`의 음원 제외 규칙을 유지한다. 사이트 배포 파일에 MP3가 없어도 음악이 나와야 한다.
- 음원 Worker의 `workers_dev: false`, `preview_urls: false`를 유지한다. 사용자는 사이트의 로그인된 `/api/music/곡ID`로 음악을 듣는다.
- MP3를 GitHub에 올리지 않는다. Git 제외된 로컬 파일을 음원 전용 Worker에만 업로드한다.
- 음원 서비스 배포 전 `check-music-assets.js`로 모든 곡이 존재하고 크기가 유효한지 확인한다. 파일이 빠졌을 때 검사를 우회하거나 빈 상태로 배포하지 않는다.

## 현재 구조

```text
로그인한 브라우저
  → ddongvoid: /api/music/곡ID
  → MUSIC_ASSETS 서비스 바인딩
  → ddongvoid-music-assets: 비공개 MP3 자산
```

사이트 자동 배포가 MP3가 없는 GitHub 체크아웃으로 실행되어도 음원 Worker의 기존 파일은 유지된다. 사이트를 다시 배포하는 것으로 음악을 덮어쓰지 않는다.

## 곡 순서와 로컬 원본

순서는 `public/music-library.js`에서 관리한다.

| 순서 | 곡 | 곡 ID | 로컬 배포 파일 |
| --- | --- | --- | --- |
| 1 | Kelly Clarkson — Underneath The Tree | `underneath-the-tree` | `public/api/music-files/underneath-the-tree.mp3` |
| 2 | Mariah Carey — All I Want For Christmas Is You | `all-i-want-for-christmas` | `public/api/music-files/all-i-want-for-christmas.mp3` |
| 3 | Post Malone — Circles | `circles` | `public/api/music.mp3` |
| 4 | Ariana Grande — Santa Tell Me | `santa-tell-me` | `public/api/music-files/santa-tell-me.mp3` |
| 5 | 아이유 — 미리 메리 크리스마스 | `iu-merry-christmas` | `public/api/music-files/iu-merry-christmas.mp3` |
| 6 | Wham! — Last Christmas | `last-christmas` | `public/api/music-files/last-christmas.mp3` |

이 MP3들은 Git에서 제외되므로 다른 PC나 CI에는 없을 수 있다. 현재 PC에서는 위 경로에 보관하며, 사용자가 제공한 원본은 다운로드 폴더에도 있다.

음원 Worker의 자산 루트는 `public/api`이므로 내부 주소는 `/music.mp3`, `/music-files/곡ID.mp3`이다. 사이트 서버가 내부 주소로 변환하며 브라우저에 비공개 서비스 주소를 전달하지 않는다.

## 명령

`Web` 폴더에서 실행한다.

### 일반 사이트 수정·배포

```powershell
npm run check
npm run deploy
```

GitHub의 `codex/web-production` 브랜치 자동 배포도 사이트용 `npm run deploy`를 사용한다. 이 과정에는 로컬 MP3가 필요 없다.

### 음원 최초 설정 또는 추가·교체

1. 현재 목록의 MP3 파일을 모두 준비한다. 새 곡이면 `public/music-library.js`와 관련 표시·검사를 갱신한다.
2. 아래 명령으로 파일 검사를 통과한 뒤 음원 Worker를 배포한다.
3. 사이트 코드도 바뀌었으면 그다음 사이트를 배포하거나 푸시한다. 음원 Worker가 먼저 존재해야 한다.

```powershell
npm run deploy:music
```

이 명령은 `node check-music-assets.js`가 성공해야 실제 배포를 실행한다. 파일 하나의 최대 크기는 25 MiB로 검사한다.

### 로컬 실행

```powershell
npm run dev
```

사이트·음원 Worker를 함께 실행하여 서비스 바인딩으로 연결한다. 로컬에서 음악까지 들으려면 로컬 MP3가 필요하다.

## 현재 플레이어 설정

- 첫 방문 기본 볼륨: 50%. 저장한 볼륨이 있으면 해당 값을 복원한다.
- 실제 출력 배율: `0.15`. 예를 들어 표시 50%이면 `Audio.volume`은 `0.075`이다.
- 현재 시간·전체 길이 표시와 진행 막대 탐색을 지원한다.
- 로그인한 사용자에게만 재생하고, 키보드 리듬 화면에서는 자동으로 일시정지한다.

## 오류를 확인할 때

이전 장애는 MP3를 사이트의 로컬 정적 파일로만 배포한 상태에서, 이후 GitHub 자동 배포가 음원 없는 사이트로 덮어써 6곡이 모두 404가 된 것이 원인이었다. 현재는 별도 음원 서비스로 분리했다.

음원 오류가 나면 다음을 확인한다.

1. 운영 사이트의 `MUSIC_ASSETS` 바인딩이 `ddongvoid-music-assets`를 가리키는가.
2. 음원 Worker에 기대한 버전과 모든 곡이 배포되어 있는가.
3. 로그인한 요청이 200 또는 바이트 범위 요청에 206을 반환하는가. 비로그인은 401이어야 한다.
4. 음원 Worker의 공개 URL은 열려 있지 않은가.

서비스 구조 변경을 검증할 때는 **사이트 자산에 MP3가 0개인 상태**에서 별도 서비스의 6곡 원본 해시·구간 재생·로그인 보호를 검사한다. 사이트 자동 배포 이후에도 음원 Worker 버전과 재생이 유지되는지 확인한다. 사이트에 MP3를 다시 끼워 넣는 임시 복구로 마무리하지 않는다.
