import type {
  ImagePoint,
  NormalizedPoint,
  PageCandidateScore,
  PageCorners,
  PageCornerName,
  PageDetectionCandidate,
  PageGeometryValidation,
  PerspectiveDimensions,
} from "@/domain/document-types";

export const PAGE_FALLBACK_MARGIN = 0.055;
export const PAGE_MIN_AREA_RATIO = 0.025;
export const PAGE_MIN_SIDE_RATIO = 0.025;
export const PERSPECTIVE_MAX_SIDE = 2_600;
export const PERSPECTIVE_MAX_PIXELS = 6_500_000;

const CORNER_NAMES: PageCornerName[] = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
];

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function clamp01(value: number): number {
  if (!finite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function fallbackPageCorners(
  margin = PAGE_FALLBACK_MARGIN,
): PageCorners {
  const safeMargin = Math.min(0.25, Math.max(0, margin));
  return {
    topLeft: { x: safeMargin, y: safeMargin },
    topRight: { x: 1 - safeMargin, y: safeMargin },
    bottomRight: { x: 1 - safeMargin, y: 1 - safeMargin },
    bottomLeft: { x: safeMargin, y: 1 - safeMargin },
  };
}

export function wholeImageCorners(): PageCorners {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 1, y: 0 },
    bottomRight: { x: 1, y: 1 },
    bottomLeft: { x: 0, y: 1 },
  };
}

export function imagePointToNormalized(
  point: ImagePoint,
  width: number,
  height: number,
): NormalizedPoint {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01(point.x / width),
    y: clamp01(point.y / height),
  };
}

export function normalizedPointToImage(
  point: NormalizedPoint,
  width: number,
  height: number,
): ImagePoint {
  return {
    x: clamp01(point.x) * Math.max(0, width),
    y: clamp01(point.y) * Math.max(0, height),
  };
}

export function normalizedPointToPreview(
  point: NormalizedPoint,
  preview: { left: number; top: number; width: number; height: number },
): ImagePoint {
  return {
    x: preview.left + clamp01(point.x) * Math.max(0, preview.width),
    y: preview.top + clamp01(point.y) * Math.max(0, preview.height),
  };
}

export function previewPointToNormalized(
  point: ImagePoint,
  preview: { left: number; top: number; width: number; height: number },
): NormalizedPoint {
  if (preview.width <= 0 || preview.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((point.x - preview.left) / preview.width),
    y: clamp01((point.y - preview.top) / preview.height),
  };
}

export function detectionPointToOriginal(
  point: ImagePoint,
  detectionWidth: number,
  detectionHeight: number,
  originalWidth: number,
  originalHeight: number,
): ImagePoint {
  if (detectionWidth <= 0 || detectionHeight <= 0) return { x: 0, y: 0 };
  return {
    x: point.x * originalWidth / detectionWidth,
    y: point.y * originalHeight / detectionHeight,
  };
}

function distance(left: ImagePoint, right: ImagePoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function signedArea(points: readonly ImagePoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function cross(a: ImagePoint, b: ImagePoint, c: ImagePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isConvexPoints(points: readonly ImagePoint[]): boolean {
  if (points.length !== 4) return false;
  let direction = 0;
  for (let index = 0; index < points.length; index += 1) {
    const value = cross(
      points[index],
      points[(index + 1) % points.length],
      points[(index + 2) % points.length],
    );
    if (Math.abs(value) < 1e-8) return false;
    const nextDirection = Math.sign(value);
    if (direction !== 0 && nextDirection !== direction) return false;
    direction = nextDirection;
  }
  return true;
}

function onSegment(a: ImagePoint, b: ImagePoint, point: ImagePoint): boolean {
  return (
    point.x >= Math.min(a.x, b.x) - 1e-8 &&
    point.x <= Math.max(a.x, b.x) + 1e-8 &&
    point.y >= Math.min(a.y, b.y) - 1e-8 &&
    point.y <= Math.max(a.y, b.y) + 1e-8
  );
}

function segmentsIntersect(
  a: ImagePoint,
  b: ImagePoint,
  c: ImagePoint,
  d: ImagePoint,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (
    Math.sign(abC) !== Math.sign(abD) &&
    Math.sign(cdA) !== Math.sign(cdB)
  ) {
    return true;
  }
  if (Math.abs(abC) < 1e-8 && onSegment(a, b, c)) return true;
  if (Math.abs(abD) < 1e-8 && onSegment(a, b, d)) return true;
  if (Math.abs(cdA) < 1e-8 && onSegment(c, d, a)) return true;
  if (Math.abs(cdB) < 1e-8 && onSegment(c, d, b)) return true;
  return false;
}

export function pageCornersToArray(corners: PageCorners): NormalizedPoint[] {
  return CORNER_NAMES.map((name) => corners[name]);
}

export function orderPagePoints(
  input: readonly ImagePoint[],
): PageCorners | null {
  if (
    input.length !== 4 ||
    input.some((point) => !finite(point.x) || !finite(point.y))
  ) {
    return null;
  }

  const center = input.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const angular = [...input].sort(
    (left, right) =>
      Math.atan2(left.y - center.y, left.x - center.x) -
      Math.atan2(right.y - center.y, right.x - center.x),
  );
  const start = angular.reduce((bestIndex, point, index) => {
    const best = angular[bestIndex];
    const pointRank = point.y + point.x * 0.35;
    const bestRank = best.y + best.x * 0.35;
    return pointRank < bestRank ? index : bestIndex;
  }, 0);
  let ordered = [...angular.slice(start), ...angular.slice(0, start)];
  if (signedArea(ordered) < 0) {
    ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
  }
  if (
    !isConvexPoints(ordered) ||
    segmentsIntersect(ordered[0], ordered[1], ordered[2], ordered[3]) ||
    segmentsIntersect(ordered[1], ordered[2], ordered[3], ordered[0])
  ) {
    return null;
  }

  return {
    topLeft: imagePointToNormalized(ordered[0], 1, 1),
    topRight: imagePointToNormalized(ordered[1], 1, 1),
    bottomRight: imagePointToNormalized(ordered[2], 1, 1),
    bottomLeft: imagePointToNormalized(ordered[3], 1, 1),
  };
}

export function normalizedCornersFromImagePoints(
  input: readonly ImagePoint[],
  width: number,
  height: number,
): PageCorners | null {
  if (width <= 0 || height <= 0) return null;
  const normalized = input.map((point) =>
    imagePointToNormalized(point, width, height),
  );
  return orderPagePoints(normalized);
}

export function validatePageCorners(
  corners: PageCorners,
  minimumAreaRatio = PAGE_MIN_AREA_RATIO,
): PageGeometryValidation {
  const points = pageCornersToArray(corners);
  const errors: string[] = [];

  if (points.some((point) => !finite(point.x) || !finite(point.y))) {
    errors.push("Les coordonnées des coins sont invalides.");
  }
  if (
    points.some(
      (point) => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1,
    )
  ) {
    errors.push("Un coin se trouve hors de l’image.");
  }

  const areaRatio = Math.abs(signedArea(points));
  if (areaRatio < minimumAreaRatio) {
    errors.push("La zone sélectionnée est trop petite.");
  }
  if (
    points.some(
      (point, index) =>
        distance(point, points[(index + 1) % points.length]) <
        PAGE_MIN_SIDE_RATIO,
    )
  ) {
    errors.push("Deux coins sont trop proches.");
  }
  if (
    segmentsIntersect(points[0], points[1], points[2], points[3]) ||
    segmentsIntersect(points[1], points[2], points[3], points[0])
  ) {
    errors.push("Les côtés du cadre se croisent.");
  }
  if (!isConvexPoints(points)) {
    errors.push("Le cadre doit rester convexe.");
  }

  return { valid: errors.length === 0, errors, areaRatio };
}

function rotatePoint(
  point: NormalizedPoint,
  rotation: 90 | -90 | 180,
): NormalizedPoint {
  if (rotation === 90) return { x: 1 - point.y, y: point.x };
  if (rotation === -90) return { x: point.y, y: 1 - point.x };
  return { x: 1 - point.x, y: 1 - point.y };
}

export function rotatePageCorners(
  corners: PageCorners,
  rotation: 90 | -90 | 180,
): PageCorners {
  const rotated = pageCornersToArray(corners).map((point) =>
    rotatePoint(point, rotation),
  );
  return orderPagePoints(rotated) ?? fallbackPageCorners();
}

function interiorAngle(
  previous: ImagePoint,
  current: ImagePoint,
  next: ImagePoint,
): number {
  const left = { x: previous.x - current.x, y: previous.y - current.y };
  const right = { x: next.x - current.x, y: next.y - current.y };
  const denominator = Math.hypot(left.x, left.y) * Math.hypot(right.x, right.y);
  if (denominator <= 0) return 0;
  const cosine = Math.min(
    1,
    Math.max(-1, (left.x * right.x + left.y * right.y) / denominator),
  );
  return Math.acos(cosine) * 180 / Math.PI;
}

export function scorePageQuadrilateral(
  corners: PageCorners,
): PageDetectionCandidate {
  const points = pageCornersToArray(corners);
  const validation = validatePageCorners(corners);
  const areaRatio = validation.areaRatio;
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  const centerDistance = Math.hypot(center.x - 0.5, center.y - 0.5) / 0.707;
  const angles = points.map((point, index) =>
    interiorAngle(
      points[(index + 3) % 4],
      point,
      points[(index + 1) % 4],
    ),
  );
  const meanAngleError =
    angles.reduce((sum, angle) => sum + Math.abs(angle - 90), 0) / 4;
  const sides = points.map((point, index) =>
    distance(point, points[(index + 1) % 4]),
  );
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  const edgeDistance =
    points.reduce(
      (sum, point) =>
        sum + Math.min(point.x, 1 - point.x, point.y, 1 - point.y),
      0,
    ) / 4;

  const criteria: PageCandidateScore = {
    area: Math.min(1, Math.max(0, (areaRatio - 0.08) / 0.72)),
    angles: Math.min(1, Math.max(0, 1 - meanAngleError / 55)),
    center: Math.min(1, Math.max(0, 1 - centerDistance / 0.75)),
    edges: Math.min(1, Math.max(0, 1 - Math.abs(edgeDistance - 0.055) / 0.3)),
    shape:
      maxSide > 0
        ? Math.min(1, Math.max(0, minSide / maxSide * 2.2))
        : 0,
  };
  const score =
    criteria.area * 0.38 +
    criteria.angles * 0.2 +
    criteria.center * 0.16 +
    criteria.edges * 0.1 +
    criteria.shape * 0.16;
  const isConvex = isConvexPoints(points);
  const confidence = validation.valid && isConvex ? score : 0;

  return {
    corners,
    confidence,
    areaRatio,
    isConvex,
    score,
    criteria,
  };
}

export function calculatePerspectiveDimensions(
  corners: PageCorners,
  sourceWidth: number,
  sourceHeight: number,
  maxSide = PERSPECTIVE_MAX_SIDE,
  maxPixels = PERSPECTIVE_MAX_PIXELS,
): PerspectiveDimensions {
  const points = pageCornersToArray(corners).map((point) =>
    normalizedPointToImage(point, sourceWidth, sourceHeight),
  );
  const rawWidth = Math.max(
    distance(points[0], points[1]),
    distance(points[3], points[2]),
  );
  const rawHeight = Math.max(
    distance(points[0], points[3]),
    distance(points[1], points[2]),
  );
  const sideScale = Math.min(1, maxSide / Math.max(rawWidth, rawHeight, 1));
  const pixelScale = Math.min(
    1,
    Math.sqrt(maxPixels / Math.max(rawWidth * rawHeight, 1)),
  );
  const scale = Math.min(sideScale, pixelScale);

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
    scale,
    wasLimited: scale < 0.999,
  };
}

export function updatePageCorner(
  corners: PageCorners,
  name: PageCornerName,
  point: NormalizedPoint,
): PageCorners {
  return {
    ...corners,
    [name]: { x: clamp01(point.x), y: clamp01(point.y) },
  };
}
