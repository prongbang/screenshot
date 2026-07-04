declare module "puppeteer" {
  export interface LaunchOptions {
    headless?: boolean;
    args?: string[];
  }

  export interface Viewport {
    width: number;
    height: number;
  }

  export interface ScreenshotOptions {
    type: "png" | "jpeg";
    quality?: number;
    fullPage?: boolean;
  }

  export interface ElementHandle {
    // placeholder for compatibility only
  }

  export interface Browser {
    close(): Promise<void>;
    newPage(): Promise<Page>;
  }

  export interface Page {
    setViewport(viewport: Viewport): Promise<void>;
    goto(url: string, options: { waitUntil: "networkidle2"; timeout: number }): Promise<unknown>;
    waitForSelector(selector: string, options: { timeout: number }): Promise<ElementHandle | null>;
    screenshot(options: ScreenshotOptions): Promise<Buffer>;
    evaluate<T>(pageFunction: () => T): Promise<T>;
  }

  export function launch(options?: LaunchOptions): Promise<Browser>;
}
