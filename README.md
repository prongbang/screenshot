# screenshot

TypeScript library for full-page screenshot capture and export:

- **Browser**: Capture current page via DOM rendering (`captureFullPageScreenshot`), export as image or PDF, download files
- **Node.js**: Capture URL via headless Puppeteer (`captureUrlScreenshot`)
- **Image utilities**: Wait for images to load, convert to base64 (solves CORS issues), replace in-page images
- **PDF export**: Multi-page PDF generation via jsPDF

Supports capturing the whole page or a specific element (specify via `target` as an `id` or `HTMLElement`).

## Install

```bash
npm install @prongbang/screenshot
```

### Optional dependencies

Install only what you need:

```bash
# For Node.js screenshot capture
npm install puppeteer

# For PDF export (multi-page)
npm install jspdf

# For PDF embedding (single file)
npm install pdf-lib
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

### Browser download image

```ts
import { captureFullPageScreenshot, downloadBlob } from "@prongbang/screenshot";

const result = await captureFullPageScreenshot({
  format: "png",
  quality: 0.95,
});

downloadBlob(result.blob, "screenshot.png");
```

### Browser download image with progress

```ts
import { captureFullPageScreenshot, downloadBlobWithProgress } from "@prongbang/screenshot";

const result = await captureFullPageScreenshot({ format: "png" });

await downloadBlobWithProgress(result.blob, "screenshot.png", {
  onProgress: ({ loaded, total }) => {
    console.log(`Downloaded ${loaded}/${total} bytes`);
  }
});
```

### Browser PDF export (single file)

```ts
import { captureFullPageScreenshot } from "@prongbang/screenshot";

const result = await captureFullPageScreenshot({
  format: "pdf",
});

// result.dataUrl: data:application/pdf;base64,...
// result.blob: PDF blob
```

### Browser multi-page PDF export

```ts
import { exportPdfMultiPage } from "@prongbang/screenshot";

// Install jsPDF first: npm i jspdf
await exportPdfMultiPage(document.body, {
  filename: "export.pdf",
  orientation: "portrait",
  margin: 10,
  waitForImages: true,
});
```

### Wait for images and prepare for export

```ts
import {
  waitForImagesToLoad,
  replaceImagesWithBase64,
  captureFullPageScreenshot,
} from "@prongbang/screenshot";

// Wait for all images to load
await waitForImagesToLoad(document.body);

// Convert all images to base64 (prevents CORS issues in PDF)
await replaceImagesWithBase64(document.body);

// Now capture
const result = await captureFullPageScreenshot({
  format: "png",
});
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

### Screenshot capture

- `captureFullPageScreenshot(options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult>`
  - Browser-only. Captures full page from the current `document` using `html2canvas-pro`.
  - `target` can be an `HTMLElement` or element `id` (string).
  - Returns `{ dataUrl, blob, width, height }`

- `captureUrlScreenshot(url: string, options?: NodeScreenshotOptions): Promise<NodeScreenshotResult>`
  - Node-only. Requires `puppeteer` at runtime.
  - Returns `{ dataUrl, buffer, width, height }`

### Download

- `downloadBlob(blob: Blob, filename: string): void`
  - Browser-only. Trigger browser download of a blob.

- `downloadBlobWithProgress(blob: Blob, filename: string, options?: DownloadBlobOptions): Promise<void>`
  - Browser-only. Download blob while reporting progress.
  - Options: `{ onProgress?: (progress: { loaded, total }) => void }`

### Image utilities

- `waitForImagesToLoad(element: HTMLElement): Promise<void>`
  - Browser-only. Wait for all `<img>` elements to finish loading.

- `convertImageToBase64(url: string): Promise<string>`
  - Browser-only. Fetch an image and convert to base64 data URL.

- `replaceImagesWithBase64(element?: HTMLElement): Promise<void>`
  - Browser-only. Replace all `<img>` src with base64 data URLs (prevents CORS issues).

### PDF export

- `exportPdfMultiPage(element: HTMLElement | string, options?: ExportPdfOptions): Promise<void>`
  - Browser-only. Generate multi-page PDF from element.
  - Requires `jsPDF`: `npm install jspdf`
  - Options extend `BaseScreenshotOptions`, plus:
    - `orientation?: "p" | "portrait" | "l" | "landscape"` (default: "p")
    - `margin?: number` (default: 10)
    - `waitForImages?: boolean` (default: false)

## Build

```bash
npm run build
```

Output:

- `dist/index.js` (ESM)
- `dist/index.d.ts` (TypeScript declarations)

## Publish

```bash
npm publish
```
