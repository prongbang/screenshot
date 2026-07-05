declare module "html2canvas-pro" {
  export interface Options {
    backgroundColor?: string | null;
    scale?: number;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
    useCORS?: boolean;
    allowTaint?: boolean;
    removeContainer?: boolean;
    foreignObjectRendering?: boolean;
    ignoreElements?: (element: HTMLElement) => boolean;
    logging?: boolean;
    imageTimeout?: number;
    x?: number;
    y?: number;
    onclone?: (document: Document, element: HTMLElement) => void;
  }

  export default function html2canvas(
    element: HTMLElement,
    options?: Options
  ): Promise<HTMLCanvasElement>;
}
