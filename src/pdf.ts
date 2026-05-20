import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// SVGのwidth/heightを100%に正規化してコンテナにフィットさせる
function normalizeSvg(svg: string): string {
  return svg
    .replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i, '$1 width="100%"')
    .replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1 height="100%"');
}

export async function exportPdf(slideDir: string, outputPath: string): Promise<void> {
  const svgFiles = fs.readdirSync(slideDir)
    .filter(f => f.endsWith('.svg'))
    .sort()
    .map(f => path.join(slideDir, f));

  if (svgFiles.length === 0) {
    throw new Error(`${slideDir} にSVGファイルが見つかりません`);
  }

  const slidesHtml = svgFiles.map(f => {
    const svg = normalizeSvg(fs.readFileSync(f, 'utf-8'));
    return `<div class="slide">${svg}</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 1920px 1080px; margin: 0; }
  body { background: #000; }
  .slide {
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    page-break-after: always;
  }
  .slide:last-child { page-break-after: auto; }
  .slide svg { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>${slidesHtml}</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      width: '1920px',
      height: '1080px',
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
