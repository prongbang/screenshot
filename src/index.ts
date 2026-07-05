export type ScreenshotFormat = "png" | "jpeg" | "webp" | "pdf";

export interface BaseScreenshotOptions {
  format?: ScreenshotFormat;
  quality?: number;
  backgroundColor?: string | null;
  scale?: number;
  timeoutMs?: number;
  filename?: string;
}

export interface BrowserScreenshotOptions extends BaseScreenshotOptions {
  /**
   * Capture this target. Can be an element reference or an element id.
   * Default is document.documentElement.
   */
  target?: HTMLElement | string;
}

export interface NodeScreenshotOptions extends BaseScreenshotOptions {
  waitForSelector?: string;
  fullPage?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  args?: string[];
}

export interface BrowserScreenshotResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface NodeScreenshotResult {
  dataUrl: string;
  buffer: Buffer;
  width: number;
  height: number;
}

export type ScreenshotResult = BrowserScreenshotResult | NodeScreenshotResult;

const MIME_TYPES: Record<ScreenshotFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

const DEFAULT_FORMAT: ScreenshotFormat = "png";

const getDefaultScale = (): number => {
  return typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 1) : 1;
};

const isBrowser = (): boolean => {
  return typeof window !== "undefined" && typeof document !== "undefined";
};

const validateDimension = (value?: number): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
};

const decodeSvgDataUri = (url: string): string | null => {
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  const meta = url.slice(0, commaIndex);
  const payload = url.slice(commaIndex + 1);

  if (!meta.includes("image/svg+xml")) {
    return null;
  }

  try {
    if (meta.includes("base64")) {
      return typeof atob !== "undefined" ? atob(payload) : null;
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
};

/**
 * Convert CSS `mask-image` icons into `background-image` so html2canvas-pro can
 * rasterize them. Iconify/UnoCSS utilities (e.g. `i-lucide:flame`) render icons
 * as `background-color: currentColor` + `mask-image: <svg>`, which the canvas
 * renderer draws as a solid colored box because it does not support CSS masks.
 * Runs against a cloned document, so the live DOM is never modified.
 */
const inlineMaskedIcons = (root: Document | HTMLElement): void => {
  const doc = "defaultView" in root ? (root as Document) : root.ownerDocument;
  const view = doc?.defaultView ?? (typeof window !== "undefined" ? window : null);
  if (!view) {
    return;
  }

  const scope: ParentNode = root as ParentNode;
  const elements = scope.querySelectorAll<HTMLElement>("*");

  elements.forEach((el) => {
    const style = view.getComputedStyle(el);
    const mask = style.maskImage || (style as any).webkitMaskImage || "none";
    if (!mask || mask === "none") {
      return;
    }

    const urlMatch = mask.match(/url\((['"]?)(.*?)\1\)/);
    if (!urlMatch) {
      return;
    }

    let svg = decodeSvgDataUri(urlMatch[2]);
    if (!svg) {
      return;
    }

    // Iconify utilities set `background-color: currentColor`, so the icon color
    // resolves to the element's `color`.
    const color = style.color || "#000";
    svg = svg.replace(/currentColor/g, color);

    const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = `url("${encoded}")`;
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundSize = "contain";
    el.style.maskImage = "none";
    (el.style as any).webkitMaskImage = "none";
  });
};

const resolveBrowserTarget = (target?: HTMLElement | string): HTMLElement => {
  if (typeof target === "string") {
    const raw = target.trim();
    const selector = raw.startsWith("#") ? raw : `#${raw}`;
    const element = document.querySelector(selector);

    if (!element || !(element instanceof HTMLElement)) {
      throw new Error(`Target element not found for id "${raw}".`);
    }
    return element;
  }

  return target ?? document.documentElement;
};

const buildBrowserCanvasOptions = (element: HTMLElement, scale: number, timeoutMs: number, backgroundColor?: string | null) => {
  const width = validateDimension(element.scrollWidth) ?? element.clientWidth ?? 0;
  const height = validateDimension(element.scrollHeight) ?? element.clientHeight ?? 0;

  // `width`/`height` crop to the full scrollable area. `windowWidth`/
  // `windowHeight` must stay at the real viewport so the cloned document lays
  // out exactly like the live page — forcing them to the full scroll size
  // reflows viewport-relative CSS (100vh, sticky, centered max-width wrappers)
  // and causes overflow / uneven margins in the capture.
  const windowWidth =
    typeof window !== "undefined" ? window.innerWidth || width : width;
  const windowHeight =
    typeof window !== "undefined" ? window.innerHeight || height : height;

  return {
    backgroundColor,
    width,
    height,
    scale,
    windowWidth,
    windowHeight,
    useCORS: true,
    allowTaint: false,
    removeContainer: true,
    logging: false,
    imageTimeout: timeoutMs,
    foreignObjectRendering: false,
    onclone: (clonedDoc: Document) => {
      inlineMaskedIcons(clonedDoc);
    },
  };
};

const captureCanvasWithShadowFallback = async (
  element: HTMLElement,
  html2canvasOptions: Record<string, unknown>
): Promise<HTMLCanvasElement> => {
  const module = await import("html2canvas-pro");
  const capture = module.default;

  // `foreignObjectRendering: false` is the reliable renderer. The `true` path
  // can silently return a blank canvas (no error thrown) in many browsers, so
  // it must not be the default — only fall back to it if the standard renderer
  // throws.
  try {
    return await capture(element, {
      ...(html2canvasOptions as unknown as Record<string, unknown>),
      foreignObjectRendering: false,
    });
  } catch (error) {
    return capture(element, {
      ...(html2canvasOptions as unknown as Record<string, unknown>),
      foreignObjectRendering: true,
    });
  }
};

const isPdfFormat = (format: ScreenshotFormat): boolean => {
  return format === "pdf";
};

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG blob from canvas."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
};

const canvasToPngBytes = async (canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await canvasToPngBlob(canvas);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
};

const pngBytesToPdf = async (
  imageBytes: Uint8Array,
  width: number,
  height: number,
  usePng = true
): Promise<{ dataUrl: string; bytes: Uint8Array; blob: Blob }> => {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const image = usePng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height,
  });
  const data = await pdfDoc.save();
  const bytes = new Uint8Array(data);
  return {
    dataUrl: `data:${MIME_TYPES.pdf};base64,${toBase64(bytes)}`,
    bytes,
    blob: new Blob([bytes], { type: MIME_TYPES.pdf }),
  };
};

function toDataUrlFromCanvas(
  canvas: HTMLCanvasElement,
  format: ScreenshotFormat,
  quality: number | undefined
): Promise<string> {
  return new Promise((resolve, reject) => {
    const mimeType = MIME_TYPES[format];
    const dataUrl = canvas.toDataURL(mimeType, quality);
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      reject(new Error("Failed to convert canvas to data URL."));
      return;
    }
    resolve(dataUrl);
  });
}

function toBlobFromCanvas(
  canvas: HTMLCanvasElement,
  format: ScreenshotFormat,
  quality: number | undefined
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = MIME_TYPES[format];
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob from canvas."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Trigger a browser download of a blob using a temporary object URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (!isBrowser()) {
    throw new Error("`downloadBlob` only runs in browser (window/document not found).");
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface DownloadBlobOptions {
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Trigger a browser download of a blob, reporting read progress before saving.
 */
export async function downloadBlobWithProgress(
  blob: Blob,
  filename: string,
  options: DownloadBlobOptions = {}
): Promise<void> {
  if (!isBrowser()) {
    throw new Error("`downloadBlobWithProgress` only runs in browser (window/document not found).");
  }

  const { onProgress } = options;
  const total = blob.size;

  if (onProgress && total > 0) {
    const reader = blob.stream().getReader();
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      loaded += value.byteLength;
      onProgress({ loaded, total });
    }
  } else {
    onProgress?.({ loaded: total, total });
  }

  downloadBlob(blob, filename);
}

/**
 * Capture a full-page screenshot from current browser window.
 */
export async function captureFullPageScreenshot(
  options: BrowserScreenshotOptions = {}
): Promise<BrowserScreenshotResult> {
  if (!isBrowser()) {
    throw new Error(
      "`captureFullPageScreenshot` only runs in browser (window/document not found)."
    );
  }

  const {
    format = DEFAULT_FORMAT,
    quality = 0.95,
    backgroundColor = null,
    scale = getDefaultScale(),
    target,
    timeoutMs = 8000,
  } = options;

  if (quality < 0 || quality > 1) {
    throw new Error("Option `quality` must be between 0 and 1.");
  }

  const element = resolveBrowserTarget(target);

  // Wait for web/icon fonts to finish loading before capture. If fonts are
  // still swapping, text is measured with fallback metrics (causing overlap)
  // and icon-font glyphs render as empty boxes.
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {
      // Ignore font-loading errors and proceed with capture.
    }
  }

  const canvasOptions = buildBrowserCanvasOptions(element, scale, timeoutMs, backgroundColor);
  const canvas = await captureCanvasWithShadowFallback(element, canvasOptions);

  if (isPdfFormat(format)) {
    const pngBytes = await canvasToPngBytes(canvas);
    const pdf = await pngBytesToPdf(pngBytes, canvas.width, canvas.height, true);
    return {
      dataUrl: pdf.dataUrl,
      blob: pdf.blob,
      width: canvas.width,
      height: canvas.height,
    };
  }

  const dataUrl = await toDataUrlFromCanvas(
    canvas,
    format,
    format === "png" ? undefined : quality
  );
  const blob = await toBlobFromCanvas(
    canvas,
    format,
    format === "png" ? undefined : quality
  );

  return {
    dataUrl,
    blob,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Capture a full-page screenshot from a remote URL in Node.js using Puppeteer.
 * Puppeteer is optional; install it only if you want this function.
 */
export async function captureUrlScreenshot(
  url: string,
  options: NodeScreenshotOptions = {}
): Promise<NodeScreenshotResult> {
  if (isBrowser()) {
    throw new Error(
      "`captureUrlScreenshot` is a Node.js function. In browser, use captureFullPageScreenshot."
    );
  }

  const {
    format = DEFAULT_FORMAT,
    quality = 0.95,
    timeoutMs = 8000,
    waitForSelector,
    fullPage = true,
    viewportWidth = 1440,
    viewportHeight = 900,
    args = ["--no-sandbox", "--disable-setuid-sandbox"],
  } = options;

  if (quality < 0 || quality > 1) {
    throw new Error("Option `quality` must be between 0 and 1.");
  }
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new Error("`url` must be an absolute URL.");
  }

  let puppeteer: typeof import("puppeteer");
  try {
    puppeteer = await import("puppeteer");
  } catch (error) {
    throw new Error(
      "puppeteer is not available. Install it to use captureUrlScreenshot: npm i puppeteer"
    );
  }
  const launch = puppeteer.launch;

  let browser: import("puppeteer").Browser | null = null;
  browser = await launch({
    headless: true,
    args,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight });
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: timeoutMs,
    });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: timeoutMs });
    }

    const nodeImageFormat = format === "jpeg" ? "jpeg" : "png";
    const rawImageBuffer = await page.screenshot({
      type: nodeImageFormat,
      quality: nodeImageFormat === "png" ? undefined : Math.round(quality * 100),
      fullPage,
    });

    if (format === "pdf") {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const image = nodeImageFormat === "jpeg"
        ? await pdfDoc.embedJpg(new Uint8Array(rawImageBuffer))
        : await pdfDoc.embedPng(new Uint8Array(rawImageBuffer));

      const { width, height } = await page.evaluate(() => ({
        width: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ),
        height: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        ),
      }));

      const pagePdf = pdfDoc.addPage([width, height]);
      pagePdf.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height,
      });
      const pdfBytes = new Uint8Array(await pdfDoc.save());
      const pdfDataUrl = `data:${MIME_TYPES.pdf};base64,${toBase64(pdfBytes)}`;
      return {
        dataUrl: pdfDataUrl,
        buffer: Buffer.from(pdfBytes),
        width,
        height,
      };
    }

    const { width, height } = await page.evaluate(() => ({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      ),
    }));

    const dataUrl = `data:${MIME_TYPES[nodeImageFormat]};base64,${rawImageBuffer.toString(
      "base64"
    )}`;

    return {
      dataUrl,
      buffer: rawImageBuffer,
      width,
      height,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Wait for all images in an element to finish loading.
 */
export async function waitForImagesToLoad(element: HTMLElement): Promise<void> {
  if (!isBrowser()) {
    throw new Error("`waitForImagesToLoad` only runs in browser.");
  }

  const images = element.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          const imgElement = img as HTMLImageElement;
          if (imgElement.complete) {
            resolve();
          } else {
            imgElement.onload = () => resolve();
            imgElement.onerror = () => {
              console.warn("Image failed to load:", imgElement.src);
              resolve();
            };
          }
        })
    )
  );
}

/**
 * Convert an image URL to base64 data URL.
 */
export async function convertImageToBase64(url: string): Promise<string> {
  if (!isBrowser()) {
    throw new Error("`convertImageToBase64` only runs in browser.");
  }

  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Replace all image src attributes with base64 data URLs.
 * Useful for PDF export to avoid CORS issues.
 */
export async function replaceImagesWithBase64(element?: HTMLElement): Promise<void> {
  if (!isBrowser()) {
    throw new Error("`replaceImagesWithBase64` only runs in browser.");
  }

  const root = element ?? document.documentElement;
  const images = root.querySelectorAll("img");

  for (const img of Array.from(images)) {
    const imgElement = img as HTMLImageElement;
    const src = imgElement.src;

    if (!src.startsWith("data:") && !imgElement.getAttribute("data-html2canvas-ignore")) {
      try {
        imgElement.src = await convertImageToBase64(src);
      } catch (error) {
        console.warn(`Failed to convert image to base64: ${src}`, error);
      }
    }
  }
}

export interface ExportPdfOptions extends BaseScreenshotOptions {
  orientation?: "p" | "portrait" | "l" | "landscape";
  margin?: number;
  waitForImages?: boolean;
}

/**
 * Export a full-page screenshot as a multi-page PDF.
 * Requires jsPDF: npm install jspdf
 */
export async function exportPdfMultiPage(
  element: HTMLElement | string,
  options: ExportPdfOptions = {}
): Promise<void> {
  if (!isBrowser()) {
    throw new Error("`exportPdfMultiPage` only runs in browser.");
  }

  const dom = typeof element === "string"
    ? document.querySelector(element)
    : element;

  if (!dom || !(dom instanceof HTMLElement)) {
    throw new Error(`Target element not found.`);
  }

  if (options.waitForImages) {
    await waitForImagesToLoad(dom);
    await replaceImagesWithBase64(dom);
  }

  let jsPDF: any;
  try {
    const module = await import("jspdf");
    jsPDF = module.jsPDF;
  } catch (error) {
    throw new Error(
      "jsPDF is not available. Install it to use exportPdfMultiPage: npm i jspdf"
    );
  }

  const result = await captureFullPageScreenshot({
    format: "png",
    target: dom,
    quality: options.quality,
    backgroundColor: options.backgroundColor,
    scale: options.scale,
    timeoutMs: options.timeoutMs,
  });

  const canvas = await htmlCanvasFromDataUrl(result.dataUrl);
  const margin = options.margin ?? 10;
  const orientation = options.orientation ?? "p";

  const pdf = new jsPDF(orientation, "pt", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const contentWidth = pdfWidth - 2 * margin;
  const contentHeight = pdfHeight - 2 * margin;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  if (imgHeight <= contentHeight) {
    // Fits on a single page.
    pdf.addImage(result.dataUrl, "PNG", margin, margin, imgWidth, imgHeight);
  } else {
    // Slice the tall image across pages by shifting it up by one content
    // height each page. `position` is the y of the image top (negative after
    // the first page), so each page reveals the next slice through the window.
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(result.dataUrl, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= contentHeight;

    while (heightLeft > 0) {
      position -= contentHeight;
      pdf.addPage();
      pdf.addImage(result.dataUrl, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= contentHeight;
    }
  }

  pdf.save(options.filename ?? "export.pdf");
}

/**
 * Helper to create a canvas from a data URL.
 */
async function htmlCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}
