import { copyFile, mkdir } from 'node:fs/promises';

const target = new URL('./public/assets/slap/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['cat-atlas.png', 'cat-charge.png', 'mint-atlas.png', 'mint-charge.png']) {
  await copyFile(new URL('../Assets/Slap/' + file, import.meta.url), new URL(file, target));
}
