declare module "pdf-lib" {
  export interface DrawImageOptions {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface EmbeddedImage {
    width: number;
    height: number;
  }

  export interface PDFPage {
    drawImage(image: EmbeddedImage, options: DrawImageOptions): void;
  }

  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    addPage(size?: [number, number]): PDFPage;
    embedJpg(data: Uint8Array): Promise<EmbeddedImage>;
    embedPng(data: Uint8Array): Promise<EmbeddedImage>;
    save(): Promise<Uint8Array>;
  }
}
