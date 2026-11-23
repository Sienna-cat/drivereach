import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
for (const file of ['index.html', 'portfolio.html']) {
  const source = await readFile(`dist/${file}`, 'utf8');
  await writeFile(`dist/${file}`, source.replace('<html lang="zh-CN"', '<html data-hosting="static" lang="zh-CN"'));
}
await cp('src/domain.mjs', 'dist/domain.mjs');
await cp('src/data.mjs', 'dist/data.mjs');
await cp('src/static-api.mjs', 'dist/static-api.mjs');
await cp('evaluation/cases.mjs', 'dist/cases.mjs');
const { DATASET_HASH } = await import('./evaluation/runner.mjs');
const runner = (await readFile('evaluation/runner.mjs', 'utf8'))
  .replace("import { createHash } from 'node:crypto';\n", '')
  .replace("'../src/domain.mjs'", "'./domain.mjs'")
  .replace("createHash('sha256').update(JSON.stringify(CASES)).digest('hex')", JSON.stringify(DATASET_HASH));
await writeFile('dist/evaluation.mjs', runner);
for (const [file, output] of [['baseline-development.json','baseline'], ['current-all.json','verified-report'], ['first-holdout-v0.2.json','first-holdout']]) {
  await cp(`evidence/runs/${file}`, `dist/${output}.json`);
}

const portfolio = await readFile('dist/portfolio.html', 'utf8');
await writeFile('dist/portfolio.html', portfolio.replace('刷新和重启后保留', '当前浏览器刷新后保留'));
