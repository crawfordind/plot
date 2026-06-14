// heic2any ships no type declarations. Minimal ambient types for the bits we use
// (browser-only HEIC/HEIF → JPEG/PNG conversion).
declare module "heic2any" {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
  }
  const heic2any: (options: Heic2AnyOptions) => Promise<Blob | Blob[]>;
  export default heic2any;
}
