export interface OpenCvMat {
  rows: number;
  cols: number;
  data32S: Int32Array;
  data64F: Float64Array;
  delete(): void;
}

export interface OpenCvMatConstructor {
  new (): OpenCvMat;
}

export interface OpenCvMatVector {
  size(): number;
  get(index: number): OpenCvMat;
  delete(): void;
}

export interface OpenCvMatVectorConstructor {
  new (): OpenCvMatVector;
}

export interface OpenCvSize {
  width: number;
  height: number;
}

export interface OpenCvSizeConstructor {
  new (width: number, height: number): OpenCvSize;
}

export interface OpenCvScalarConstructor {
  new (...values: number[]): object;
}

export interface OpenCvClahe {
  apply(source: OpenCvMat, destination: OpenCvMat): void;
  delete(): void;
}

export interface OpenCv {
  Mat: OpenCvMatConstructor;
  MatVector: OpenCvMatVectorConstructor;
  Size: OpenCvSizeConstructor;
  Scalar: OpenCvScalarConstructor;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  BORDER_DEFAULT: number;
  BORDER_REPLICATE: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  MORPH_RECT: number;
  MORPH_CLOSE: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  INTER_AREA: number;
  INTER_CUBIC: number;
  imread(source: HTMLCanvasElement): OpenCvMat;
  imshow(target: HTMLCanvasElement, source: OpenCvMat): void;
  cvtColor(
    source: OpenCvMat,
    destination: OpenCvMat,
    code: number,
    destinationChannels?: number,
  ): void;
  GaussianBlur(
    source: OpenCvMat,
    destination: OpenCvMat,
    size: OpenCvSize,
    sigmaX: number,
    sigmaY: number,
    borderType: number,
  ): void;
  Canny(
    source: OpenCvMat,
    destination: OpenCvMat,
    threshold1: number,
    threshold2: number,
  ): void;
  getStructuringElement(shape: number, size: OpenCvSize): OpenCvMat;
  morphologyEx(
    source: OpenCvMat,
    destination: OpenCvMat,
    operation: number,
    kernel: OpenCvMat,
  ): void;
  adaptiveThreshold(
    source: OpenCvMat,
    destination: OpenCvMat,
    maximumValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    constant: number,
  ): void;
  findContours(
    source: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: OpenCvMat, oriented?: boolean): number;
  arcLength(curve: OpenCvMat, closed: boolean): number;
  approxPolyDP(
    curve: OpenCvMat,
    approximation: OpenCvMat,
    epsilon: number,
    closed: boolean,
  ): void;
  isContourConvex(contour: OpenCvMat): boolean;
  matFromArray(
    rows: number,
    columns: number,
    type: number,
    values: number[],
  ): OpenCvMat;
  getPerspectiveTransform(source: OpenCvMat, destination: OpenCvMat): OpenCvMat;
  warpPerspective(
    source: OpenCvMat,
    destination: OpenCvMat,
    transform: OpenCvMat,
    size: OpenCvSize,
    flags: number,
    borderMode: number,
    borderValue: object,
  ): void;
  createCLAHE(clipLimit: number, tileGridSize: OpenCvSize): OpenCvClahe;
  equalizeHist(source: OpenCvMat, destination: OpenCvMat): void;
  meanStdDev(
    source: OpenCvMat,
    mean: OpenCvMat,
    standardDeviation: OpenCvMat,
  ): void;
}
