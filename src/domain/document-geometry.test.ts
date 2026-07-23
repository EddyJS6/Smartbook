import { describe, expect, it } from "vitest";
import {
  calculatePerspectiveDimensions,
  detectionPointToOriginal,
  fallbackPageCorners,
  imagePointToNormalized,
  normalizedCornersFromImagePoints,
  normalizedPointToImage,
  previewPointToNormalized,
  rotatePageCorners,
  scorePageQuadrilateral,
  validatePageCorners,
  wholeImageCorners,
} from "@/domain/document-geometry";

describe("document geometry", () => {
  it("ordonne des points aléatoires et inclinés", () => {
    const ordered = normalizedCornersFromImagePoints(
      [
        { x: 920, y: 180 },
        { x: 120, y: 90 },
        { x: 850, y: 910 },
        { x: 180, y: 950 },
      ],
      1_000,
      1_000,
    );

    expect(ordered).toEqual({
      topLeft: { x: 0.12, y: 0.09 },
      topRight: { x: 0.92, y: 0.18 },
      bottomRight: { x: 0.85, y: 0.91 },
      bottomLeft: { x: 0.18, y: 0.95 },
    });
  });

  it("refuse une forme incomplète ou non numérique", () => {
    expect(
      normalizedCornersFromImagePoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: Number.NaN, y: 1 },
          { x: 0, y: 1 },
        ],
        1,
        1,
      ),
    ).toBeNull();
  });

  it("valide et rejette les géométries dégénérées", () => {
    expect(validatePageCorners(fallbackPageCorners()).valid).toBe(true);
    expect(
      validatePageCorners({
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.9 },
        bottomRight: { x: 0.9, y: 0.1 },
        bottomLeft: { x: 0.1, y: 0.9 },
      }).valid,
    ).toBe(false);
    expect(
      validatePageCorners({
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.11, y: 0.1 },
        bottomRight: { x: 0.11, y: 0.11 },
        bottomLeft: { x: 0.1, y: 0.11 },
      }).valid,
    ).toBe(false);
    expect(
      validatePageCorners({
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 0.5, y: 0.4 },
        bottomLeft: { x: 0, y: 1 },
      }).valid,
    ).toBe(false);
  });

  it("convertit entre original, détection, aperçu et normalisé", () => {
    expect(imagePointToNormalized({ x: 400, y: 300 }, 800, 600)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizedPointToImage({ x: 0.25, y: 0.75 }, 800, 400)).toEqual({
      x: 200,
      y: 300,
    });
    expect(
      detectionPointToOriginal({ x: 500, y: 350 }, 1_000, 700, 4_000, 2_800),
    ).toEqual({ x: 2_000, y: 1_400 });
    expect(
      previewPointToNormalized(
        { x: 150, y: 250 },
        { left: 50, top: 50, width: 200, height: 400 },
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("transforme les coins lors des rotations réelles", () => {
    const source = {
      topLeft: { x: 0.1, y: 0.2 },
      topRight: { x: 0.8, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.7 },
      bottomLeft: { x: 0.2, y: 0.8 },
    };
    const clockwise = rotatePageCorners(source, 90);
    const restored = rotatePageCorners(
      rotatePageCorners(
        rotatePageCorners(clockwise, 90),
        90,
      ),
      90,
    );

    expect(clockwise.topLeft.x).toBeCloseTo(0.2);
    expect(clockwise.topLeft.y).toBeCloseTo(0.2);
    expect(restored.topLeft.x).toBeCloseTo(source.topLeft.x);
    expect(restored.topLeft.y).toBeCloseTo(source.topLeft.y);
    expect(
      rotatePageCorners(rotatePageCorners(source, 90), -90).topLeft.x,
    ).toBeCloseTo(source.topLeft.x);
    expect(rotatePageCorners(source, 180).bottomRight).toEqual({
      x: 0.9,
      y: 0.8,
    });
  });

  it("calcule et plafonne les dimensions de sortie", () => {
    const full = calculatePerspectiveDimensions(
      wholeImageCorners(),
      1_200,
      1_800,
    );
    expect(full).toMatchObject({ width: 1_200, height: 1_800, scale: 1 });

    const limited = calculatePerspectiveDimensions(
      wholeImageCorners(),
      8_000,
      6_000,
    );
    expect(limited.wasLimited).toBe(true);
    expect(limited.width).toBeLessThanOrEqual(2_600);
    expect(limited.width * limited.height).toBeLessThanOrEqual(6_500_000);
  });

  it("classe une grande page centrale au-dessus d’un petit objet", () => {
    const page = scorePageQuadrilateral(fallbackPageCorners());
    const object = scorePageQuadrilateral({
      topLeft: { x: 0.45, y: 0.45 },
      topRight: { x: 0.55, y: 0.45 },
      bottomRight: { x: 0.55, y: 0.55 },
      bottomLeft: { x: 0.45, y: 0.55 },
    });

    expect(page.score).toBeGreaterThan(object.score);
    expect(page.isConvex).toBe(true);
    expect(object.confidence).toBe(0);
  });
});
