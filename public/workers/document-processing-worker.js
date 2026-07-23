/* OpenCV 4.13.0 worker for BrainBook. Kept as a classic worker so the
   versioned official script can be loaded with importScripts. */
"use strict";

const OPENCV_PATH = "/vendor/opencv/4.13.0/opencv.js";
const MAX_CONTOURS_TO_INSPECT = 420;
let cvPromise = null;

function serializeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function ensureOpenCv() {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    importScripts(OPENCV_PATH);
    const candidate = self.cv;
    const makePromiseSafe = (value) => {
      if (value && typeof value.then === "function") {
        delete value.then;
      }
      return value;
    };
    if (candidate?.Mat && candidate.calledRun) {
      return makePromiseSafe(candidate);
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (self.cv?.Mat && self.cv.calledRun) {
          resolve(makePromiseSafe(self.cv));
          return;
        }
        if (Date.now() - startedAt > 45_000) {
          reject(new Error("OpenCV n’a pas terminé son initialisation."));
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  })();
  return cvPromise;
}

function collectQuadrilaterals(cv, mask, width, height) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const candidates = [];
  try {
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );
    const contourCount = contours.size();
    const inspectedCount = Math.min(contourCount, MAX_CONTOURS_TO_INSPECT);
    const inspected = new Set();
    const areas = [];
    for (let sample = 0; sample < inspectedCount; sample += 1) {
      const index =
        inspectedCount <= 1
          ? 0
          : Math.round(sample * (contourCount - 1) / (inspectedCount - 1));
      if (inspected.has(index)) continue;
      inspected.add(index);
      const contour = contours.get(index);
      try {
        const area = Math.abs(cv.contourArea(contour, false));
        if (area / (width * height) >= 0.02) areas.push({ index, area });
      } finally {
        contour.delete();
      }
    }

    for (const item of areas
      .sort((left, right) => right.area - left.area)
      .slice(0, 18)) {
      const contour = contours.get(item.index);
      const approximation = new cv.Mat();
      try {
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approximation, perimeter * 0.022, true);
        if (
          approximation.rows !== 4 ||
          approximation.data32S.length < 8 ||
          !cv.isContourConvex(approximation)
        ) {
          continue;
        }
        const points = [];
        for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
          points.push({
            x: approximation.data32S[pointIndex * 2],
            y: approximation.data32S[pointIndex * 2 + 1],
          });
        }
        candidates.push(points);
      } finally {
        approximation.delete();
        contour.delete();
      }
    }
  } finally {
    hierarchy.delete();
    contours.delete();
  }
  return candidates;
}

function detect(cv, message) {
  const imageData = new ImageData(
    new Uint8ClampedArray(message.buffer),
    message.width,
    message.height,
  );
  const source = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const mask = new cv.Mat();
  const mean = new cv.Mat();
  const standardDeviation = new cv.Mat();
  let kernel = null;
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.meanStdDev(gray, mean, standardDeviation);
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0,
      0,
      cv.BORDER_DEFAULT,
    );
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const candidates = [];
    for (const [low, high] of [
      [45, 135],
      [28, 92],
    ]) {
      cv.Canny(blurred, mask, low, high);
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
      candidates.push(
        ...collectQuadrilaterals(cv, mask, message.width, message.height),
      );
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) {
      cv.adaptiveThreshold(
        blurred,
        mask,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        31,
        9,
      );
      cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
      candidates.push(
        ...collectQuadrilaterals(cv, mask, message.width, message.height),
      );
    }
    return {
      candidates,
      mean: mean.data64F[0] ?? 128,
      standardDeviation: standardDeviation.data64F[0] ?? 64,
    };
  } finally {
    kernel?.delete();
    standardDeviation.delete();
    mean.delete();
    mask.delete();
    blurred.delete();
    gray.delete();
    source.delete();
  }
}

function rectify(cv, message) {
  const imageData = new ImageData(
    new Uint8ClampedArray(message.buffer),
    message.width,
    message.height,
  );
  const source = cv.matFromImageData(imageData);
  const destination = new cv.Mat();
  let sourcePoints = null;
  let destinationPoints = null;
  let transform = null;
  let gray = null;
  let enhanced = null;
  let rgba = null;
  try {
    sourcePoints = cv.matFromArray(
      4,
      1,
      cv.CV_32FC2,
      message.sourcePoints.flatMap((point) => [point.x, point.y]),
    );
    destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      message.outputWidth - 1,
      0,
      message.outputWidth - 1,
      message.outputHeight - 1,
      0,
      message.outputHeight - 1,
    ]);
    transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
    cv.warpPerspective(
      source,
      destination,
      transform,
      new cv.Size(message.outputWidth, message.outputHeight),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );

    let output = destination;
    if (message.mode !== "original") {
      gray = new cv.Mat();
      cv.cvtColor(destination, gray, cv.COLOR_RGBA2GRAY, 0);
      output = gray;
      if (message.mode === "enhanced") {
        enhanced = new cv.Mat();
        cv.equalizeHist(gray, enhanced);
        output = enhanced;
      }
      rgba = new cv.Mat();
      cv.cvtColor(output, rgba, cv.COLOR_GRAY2RGBA, 0);
      output = rgba;
    }
    const pixels = new Uint8ClampedArray(output.data);
    return pixels.buffer;
  } finally {
    rgba?.delete();
    enhanced?.delete();
    gray?.delete();
    transform?.delete();
    destinationPoints?.delete();
    sourcePoints?.delete();
    destination.delete();
    source.delete();
  }
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  try {
    const cv = await ensureOpenCv();
    if (message.type === "init") {
      self.postMessage({ type: "ready" });
      return;
    }
    if (message.type === "detect") {
      self.postMessage({
        type: "result",
        id: message.id,
        result: detect(cv, message),
      });
      return;
    }
    if (message.type === "rectify") {
      const buffer = rectify(cv, message);
      self.postMessage(
        { type: "result", id: message.id, result: { buffer } },
        [buffer],
      );
    }
  } catch (error) {
    self.postMessage({
      type: message.type === "init" ? "initError" : "error",
      id: message.id,
      message: serializeError(error),
    });
  }
});
