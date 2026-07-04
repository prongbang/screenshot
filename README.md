# screenshot

TypeScript library for taking screenshots of a full web page from:

- Browser: capture current tab/page via DOM rendering (`captureFullPageScreenshot`)
- Node.js: capture a URL through headless browser (`captureUrlScreenshot`) with optional Puppeteer

รองรับทั้ง capture ทั้งหน้าและ element ที่ต้องการ (ระบุผ่าน `target` เป็น `id` หรือ `HTMLElement`).

## Install

```bash
npm install @prongbang/screenshot
```

## Browser usage

```ts
import { captureFullPageScreenshot } from "@prongbang/screenshot";

const result = await captureFullPageScreenshot({
  format: "png",
  quality: 0.95,
  backgroundColor: "#ffffff",
  target: "content"
});

// Save the blob or data URL.
const image = result.dataUrl;
```

### Browser PDF export

```ts
import { captureFullPageScreenshot } from "@prongbang/screenshot";

const result = await captureFullPageScreenshot({
  format: "pdf",
});

// result.dataUrl: data:application/pdf;base64,...
// result.blob: PDF blob
```

## Node.js usage

```ts
import { captureUrlScreenshot } from "@prongbang/screenshot";

const result = await captureUrlScreenshot("https://example.com", {
  format: "jpeg",
  fullPage: true,
});

await writeFile("example.jpg", result.buffer);
```

### Node PDF export

```ts
import { writeFile } from "node:fs/promises";
import { captureUrlScreenshot } from "@prongbang/screenshot";

const result = await captureUrlScreenshot("https://example.com", {
  format: "pdf",
  fullPage: true,
});

await writeFile("example.pdf", result.buffer);
```

For PDF output, install `pdf-lib`:

```bash
npm i pdf-lib
```

## API

- `captureFullPageScreenshot(options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult>`
  - Browser-only.
  - Captures full page from the current `document` using `html2canvas`.
  - `target` can be an `HTMLElement` or element `id` (string).

- `captureUrlScreenshot(url: string, options?: NodeScreenshotOptions): Promise<NodeScreenshotResult>`
  - Node-only.
  - Requires `puppeteer` dependency at runtime.
  - For `format: "pdf"` requires `pdf-lib` at runtime.

## Build

```bash
npm run build
```

Output:

- `dist/index.js`
- `dist/index.cjs`
- `dist/index.d.ts`

## Publish

```bash
npm publish
```
