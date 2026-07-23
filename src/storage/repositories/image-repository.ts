import type { PreparedImage, StoredImage, UUID } from "@/domain/models";
import { createEntityId } from "@/domain/id";
import type { BrainBookDatabase } from "@/storage/database";

export class ImageRepository {
  constructor(private readonly database: BrainBookDatabase) {}

  async create(
    image: PreparedImage,
    createdAt = new Date().toISOString(),
  ): Promise<StoredImage> {
    const storedImage: StoredImage = {
      ...image,
      id: createEntityId(),
      createdAt,
    };

    await this.database.images.add(storedImage);
    return storedImage;
  }

  async get(id: UUID): Promise<StoredImage | undefined> {
    return this.database.images.get(id);
  }

  async delete(id: UUID): Promise<void> {
    await this.database.images.delete(id);
  }
}
