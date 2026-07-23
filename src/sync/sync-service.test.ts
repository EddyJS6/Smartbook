// @vitest-environment jsdom

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { BrainBookDatabase } from "@/storage/database";
import { BookRepository } from "@/storage/repositories/book-repository";
import { NoteRepository } from "@/storage/repositories/note-repository";
import { SyncService } from "@/sync/sync-service";
import type { RemoteBookRow, RemoteNoteRow } from "@/sync/types";

const userId = "90000000-0000-4000-8000-000000000000";

type TableName = "books" | "book_notes";

function createFakeSupabase(initial?: {
  books?: RemoteBookRow[];
  notes?: RemoteNoteRow[];
  writeError?: { status: number; message: string; code?: string };
}) {
  const tables: Record<TableName, Array<Record<string, unknown>>> = {
    books: [...(initial?.books ?? [])],
    book_notes: [...(initial?.notes ?? [])],
  };
  const uploadedPaths: string[] = [];

  class Query {
    private operation: "select" | "upsert" | "update" = "select";
    private payload: Record<string, unknown> | null = null;
    private filters: Array<[string, unknown]> = [];

    constructor(private readonly table: TableName) {}

    select() {
      this.operation = "select";
      return this;
    }

    upsert(payload: Record<string, unknown>) {
      this.operation = "upsert";
      this.payload = payload;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    eq(field: string, value: unknown) {
      this.filters.push([field, value]);
      return this;
    }

    then<TResult1 = unknown>(
      onfulfilled?: ((value: {
        data: Array<Record<string, unknown>> | null;
        error: { status: number; message: string; code?: string } | null;
      }) => TResult1 | PromiseLike<TResult1>) | null,
    ): Promise<TResult1> {
      const rows = tables[this.table];
      const matches = (row: Record<string, unknown>) =>
        this.filters.every(([field, value]) => row[field] === value);
      let data: Array<Record<string, unknown>> | null = null;
      if (this.operation !== "select" && initial?.writeError) {
        return Promise.resolve({
          data: null,
          error: initial.writeError,
        }).then(onfulfilled ?? undefined);
      }

      if (this.operation === "select") {
        data = rows.filter(matches);
      } else if (this.operation === "upsert" && this.payload) {
        const index = rows.findIndex(
          (row) =>
            row.user_id === this.payload?.user_id &&
            row.id === this.payload?.id,
        );
        const next = {
          ...(index >= 0 ? rows[index] : {}),
          ...this.payload,
          server_updated_at: new Date().toISOString(),
        };
        if (index >= 0) rows[index] = next;
        else rows.push(next);
      } else if (this.operation === "update" && this.payload) {
        for (const row of rows.filter(matches)) Object.assign(row, this.payload);
      }

      return Promise.resolve({ data, error: null }).then(onfulfilled ?? undefined);
    }
  }

  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: userId, email: "eddy@example.com" },
          },
        },
        error: null,
      }),
    },
    from: (table: TableName) => new Query(table),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploadedPaths.push(path);
          return { data: { path }, error: null };
        },
        remove: async () => ({ data: [], error: null }),
        download: async () => ({
          data: null,
          error: new Error("Aucune couverture dans ce scénario"),
        }),
      }),
    },
  } as unknown as SupabaseClient<Database>;

  return { client, tables, uploadedPaths };
}

describe("SyncService integration", () => {
  let database: BrainBookDatabase;

  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    database = new BrainBookDatabase(`sync-service-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it("initialise automatiquement un compte vide", async () => {
    const fake = createFakeSupabase();
    const service = new SyncService(database, () => fake.client, () => true);

    await expect(service.initializeAccount(userId)).resolves.toEqual({
      status: "ready",
      action: "enabled",
    });
    expect(await database.syncMetadata.get("primary")).toMatchObject({
      associatedUserId: userId,
      firstSyncCompleted: true,
    });
  });

  it("envoie automatiquement les données locales vers un compte vide", async () => {
    const fake = createFakeSupabase();
    const service = new SyncService(database, () => fake.client, () => true);
    const books = new BookRepository(database);
    await books.create({
      title: "Livre local",
      author: "Auteur local",
      status: "reading",
    });

    await expect(service.initializeAccount(userId)).resolves.toEqual({
      status: "ready",
      action: "uploaded",
    });
    expect(fake.tables.books).toHaveLength(1);
  });

  it("charge automatiquement le compte sur un appareil vide", async () => {
    const now = "2026-07-23T12:00:00.000Z";
    const fake = createFakeSupabase({
      books: [
        {
          user_id: userId,
          id: "40000000-0000-4000-8000-000000000000",
          title: "Livre du compte",
          author: "Autrice distante",
          status: "finished",
          cover_storage_path: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: now,
        },
      ],
    });
    const service = new SyncService(database, () => fake.client, () => true);

    await expect(service.initializeAccount(userId)).resolves.toEqual({
      status: "ready",
      action: "downloaded",
    });
    expect(await database.books.toArray()).toMatchObject([
      { title: "Livre du compte" },
    ]);
  });

  it("demande une action explicite avant de réunir deux bibliothèques", async () => {
    const now = "2026-07-23T12:00:00.000Z";
    const fake = createFakeSupabase({
      books: [
        {
          user_id: userId,
          id: "40000000-0000-4000-8000-000000000000",
          title: "Livre distant",
          author: "Autrice distante",
          status: "finished",
          cover_storage_path: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: now,
        },
      ],
    });
    const service = new SyncService(database, () => fake.client, () => true);
    const books = new BookRepository(database);
    await books.create({
      title: "Livre local",
      author: "Auteur local",
      status: "reading",
    });

    await expect(service.initializeAccount(userId)).resolves.toMatchObject({
      status: "needsMerge",
      inspection: {
        kind: "bothFilled",
        localBooks: 1,
        remoteBooks: 1,
      },
    });
    expect(fake.tables.books).toHaveLength(1);
  });

  it("sauvegarde livres, notes et Blob de couverture puis nettoie l’Outbox", async () => {
    const fake = createFakeSupabase();
    const service = new SyncService(database, () => fake.client, () => true);
    const books = new BookRepository(database);
    const notes = new NoteRepository(database);
    const book = await books.create(
      {
        title: "Sapiens",
        author: "Yuval Noah Harari",
        status: "reading",
      },
      {
        blob: new Blob(["cover"], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        width: 600,
        height: 900,
      },
    );
    await notes.create(book.id, {
      extractedText: "Un passage.",
      personalReflection: "",
      pageNumber: null,
      tags: ["Histoire"],
    });

    const result = await service.backupLocalData(userId);

    expect(result.pushed).toBe(3);
    expect(fake.tables.books).toHaveLength(1);
    expect(fake.tables.book_notes).toHaveLength(1);
    expect(fake.uploadedPaths).toEqual([
      `${userId}/${book.id}/${book.coverImageId}.jpg`,
    ]);
    expect(await database.syncQueue.count()).toBe(0);
    expect(await database.syncMetadata.get("primary")).toMatchObject({
      associatedUserId: userId,
      firstSyncCompleted: true,
    });
  });

  it("restaure atomiquement une bibliothèque distante et garde une sauvegarde locale", async () => {
    const remoteBookId = "40000000-0000-4000-8000-000000000000";
    const remoteNoteId = "50000000-0000-4000-8000-000000000000";
    const now = "2026-07-23T12:00:00.000Z";
    const fake = createFakeSupabase({
      books: [
        {
          user_id: userId,
          id: remoteBookId,
          title: "Livre cloud",
          author: "Autrice cloud",
          status: "finished",
          cover_storage_path: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: now,
        },
      ],
      notes: [
        {
          user_id: userId,
          id: remoteNoteId,
          book_id: remoteBookId,
          extracted_text: "Texte cloud",
          personal_reflection: "",
          page_number: "12",
          tags: ["Cloud"],
          source_type: "manual",
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: now,
        },
      ],
    });
    const service = new SyncService(database, () => fake.client, () => true);
    const localBooks = new BookRepository(database);
    await localBooks.create({
      title: "Livre local",
      author: "Auteur local",
      status: "to_read",
    });

    const result = await service.restoreFromCloud(userId, true);

    expect(result).toMatchObject({ pulledBooks: 1, pulledNotes: 1 });
    expect((await database.books.toArray()).map((book) => book.title)).toEqual([
      "Livre cloud",
    ]);
    expect((await database.bookNotes.toArray())[0]).toMatchObject({
      bookId: remoteBookId,
      extractedText: "Texte cloud",
      sourceImageId: null,
    });
    expect(await database.localSafetyBackups.count()).toBe(1);
    expect(await database.syncQueue.count()).toBe(0);
  });

  it("refuse toute synchronisation automatique vers un autre compte", async () => {
    const fake = createFakeSupabase();
    const service = new SyncService(database, () => fake.client, () => true);
    await database.syncMetadata.put({
      id: "primary",
      installationId: "60000000-0000-4000-8000-000000000000",
      associatedUserId: "70000000-0000-4000-8000-000000000000",
      firstSyncCompleted: true,
      lastPushAt: null,
      lastPullAt: null,
      lastSuccessfulSyncAt: null,
      lastRestoreAt: null,
      schemaVersion: 1,
    });

    await expect(service.runFullSync(userId)).rejects.toMatchObject({
      code: "account_mismatch",
    });
    expect(fake.tables.books).toHaveLength(0);
  });

  it("garde une mutation locale hors ligne dans la queue", async () => {
    const fake = createFakeSupabase();
    const service = new SyncService(database, () => fake.client, () => true);
    const books = new BookRepository(database);
    const created = await books.create({
      title: "Livre hors ligne",
      author: "Autrice",
      status: "to_read",
    });
    await database.syncMetadata.put({
      id: "primary",
      installationId: "60000000-0000-4000-8000-000000000000",
      associatedUserId: userId,
      firstSyncCompleted: true,
      lastPushAt: null,
      lastPullAt: null,
      lastSuccessfulSyncAt: null,
      lastRestoreAt: null,
      schemaVersion: 1,
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    await expect(service.runFullSync(userId)).rejects.toMatchObject({
      code: "offline",
    });
    expect(await database.books.get(created.id)).toEqual(created);
    expect(await database.syncQueue.get(`book:${created.id}`)).toMatchObject({
      operation: "upsert",
      status: "pending",
    });
  });

  it("conserve et marque failed une opération refusée par RLS", async () => {
    const fake = createFakeSupabase({
      writeError: {
        status: 403,
        code: "42501",
        message: "new row violates row-level security policy",
      },
    });
    const service = new SyncService(database, () => fake.client, () => true);
    const books = new BookRepository(database);
    const created = await books.create({
      title: "Livre protégé",
      author: "Autrice",
      status: "reading",
    });

    await expect(service.backupLocalData(userId)).rejects.toMatchObject({
      code: "remote",
    });
    expect(await database.syncQueue.get(`book:${created.id}`)).toMatchObject({
      status: "failed",
      attemptCount: 1,
      lastError:
        "Supabase a refusé l’opération de sauvegarde. Vérifiez les politiques RLS.",
    });
    expect(await database.books.get(created.id)).toEqual(created);
  });
});
