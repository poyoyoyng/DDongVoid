# 맞짱 캐릭터

내장 image_gen으로 생성한 투명 PNG 두 장. 1536×1024, 3열×2행, 각 프레임 512×512.
원본 프레임 순서: 평소 / 공격 준비(미사용) / 공격 성공 / 공격 실패 / 방어 / 맞음.
WPF가 원본 알파를 유지하여 프레임을 잘라 표시한다. 플레이어 1은 민트, 플레이어 2는 고양이로 고정한다.

현재 사용하는 6가지 자세: 평소 / 기 모으기 / 공격 성공 / 공격 실패 / 방어 / 맞음.
기 모으기는 원본 캐릭터를 참고해 내장 image_gen으로 별도 생성한 `mint-charge.png`, `cat-charge.png`를 사용한다.
공격 선택 중에는 평소 자세를 유지하며, 턴 판정이 끝난 뒤 성공 또는 실패 자세를 표시한다.
기 모으기 중 맞으면 피격 자세와 기 모으기 효과를 함께 표시한다.
기 모으기 이미지의 정확한 생성 프롬프트는 [charge-prompts.json](charge-prompts.json)에 기록했다.

## 생성 프롬프트 사양

공통: Create a transparent 1536x1024 sprite atlas for a playful cartoon hand-slap game. Strict 3 columns by 2 rows, equal 512x512 cells. Exactly the same character, proportions, scale, and baseline in every cell. Face RIGHT. Generous transparent margins. Polished 2D sticker illustration, dark evergreen outlines, gentle cel shading, readable at 110px. Row-major poses: idle; attack wind-up; successful slap follow-through with sparkle; failed attack recoil; guarding with hands raised and shield; hit reaction, dazed with stars. Harmless comedy, no injury. No words, labels, grid, background, or extra characters. Genuine alpha transparency.

- `mint-atlas.png`: Cute mint marshmallow/bean fighter with cream face and oversized mittens.
- `cat-atlas.png`: A different cute peach-orange cat fighter with cream muzzle and mittens, small ears and a tail. Match the same visual style and atlas layout.

이 사양은 생성에 사용한 요청을 요약한 것이며, 원본 PNG는 재가공하지 않았다.
