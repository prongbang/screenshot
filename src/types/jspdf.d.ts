declare module "jspdf" {
  export interface jsPDFOptions {
    orientation?: "p" | "portrait" | "l" | "landscape";
    unit?: "pt" | "px" | "in" | "mm" | "cm" | "ex" | "em" | "pc";
    format?: string;
    compress?: boolean;
    precision?: number;
    userUnit?: number;
  }

  export interface PageSize {
    getWidth(): number;
    getHeight(): number;
  }

  export interface InternalPageSize {
    getWidth(): number;
    getHeight(): number;
  }

  export class jsPDF {
    constructor(options?: jsPDFOptions);
    constructor(orientation?: "p" | "portrait" | "l" | "landscape", unit?: string, format?: string);

    addImage(
      imageData: string | HTMLImageElement | HTMLCanvasElement | Uint8Array,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number
    ): jsPDF;

    addPage(): jsPDF;

    save(filename: string): void;

    internal: {
      pageSize: InternalPageSize;
    };
  }

  export const jsPDF: typeof jsPDF;
}
