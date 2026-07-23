"use client";

import { useEffect, useState } from "react";
import type { UUID } from "@/domain/models";
import { reportStorageError } from "@/storage/errors";
import { imageRepository } from "@/storage/repositories/book-repository";

type InternalCoverState = {
  imageId: UUID | null;
  url: string | null;
};

type CoverUrlState = {
  url: string | null;
  loading: boolean;
};

export function useCoverUrl(imageId: UUID | null): CoverUrlState {
  const [state, setState] = useState<InternalCoverState>({
    imageId: null,
    url: null,
  });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!imageId) {
      return;
    }

    void imageRepository
      .get(imageId)
      .then((image) => {
        if (!active) return;
        objectUrl = image ? URL.createObjectURL(image.blob) : null;
        setState({ imageId, url: objectUrl });
      })
      .catch((error: unknown) => {
        reportStorageError(error);
        if (active) setState({ imageId, url: null });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  return {
    url: state.imageId === imageId ? state.url : null,
    loading: Boolean(imageId && state.imageId !== imageId),
  };
}
