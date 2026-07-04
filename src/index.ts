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

  return {
    backgroundColor,
    width,
    height,
    scale,
    windowWidth: width,
    windowHeight: height,
    useCORS: true,
    allowTaint: false,
    removeContainer: true,
    logging: false,
    imageTimeout: timeoutMs,
    foreignObjectRendering: true,
  };
};

const captureCanvasWithShadowFallback = async (
  element: HTMLElement,
  html2canvasOptions: Record<string, unknown>
): Promise<HTMLCanvasElement> => {
  const withForeignObject = await import("html2canvas");
  const capture = withForeignObject.default;

  try {
    return await capture(element, {
      ...(html2canvasOptions as unknown as Record<string, unknown>),
      foreignObjectRendering: true,
    });
  } catch (error) {
    return capture(element, {
      ...(html2canvasOptions as unknown as Record<string, unknown>),
      foreignObjectRendering: false,
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
