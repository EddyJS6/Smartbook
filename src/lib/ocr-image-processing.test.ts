import { describe, expect, it } from "vitest";
import {
  OCR_MAX_IMAGE_SIDE,
  calculateOcrDimensions,
  normalizeRightAngle,
} from "@/lib/ocr-image-processing";

describe("OCR image geometry", () => {
  it("normalise les rotations par pas de 90 degrés", () => {
    expect(normalizeRightAngle(-90)).toBe(270);
    expect(normalizeRightAngle(450)).toBe(90);
    expect(normalizeRightAngle(181)).toBe(180);
  });

  it("redimensionne sans agrandir une petite image", () => {
    expect(calculateOcrDimensions(1200, 1800, 0)).toEqual({
      width: 1200,
      height: 1800,
      scale: 1,
    });
  });

  it("limite le grand côté et inverse les dimensions après rotation", () => {
    const dimensions = calculateOcrDimensions(4000, 3000, 90);

    expect(dimensions.width).toBe(1800);
    expect(dimensions.height).toBe(OCR_MAX_IMAGE_SIDE);
    expect(dimensions.scale).toBe(0.6);
  });
});
