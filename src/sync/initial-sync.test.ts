import { describe, expect, it } from "vitest";
import { determineInitialSyncCase } from "@/sync/initial-sync";

describe("first sync inspection", () => {
  it.each([
    [0, 0, 0, 0, "bothEmpty"],
    [2, 4, 0, 0, "localOnly"],
    [0, 0, 2, 4, "cloudOnly"],
    [2, 4, 2, 4, "bothFilled"],
  ] as const)(
    "classe local %i/%i et cloud %i/%i",
    (localBooks, localNotes, remoteBooks, remoteNotes, expected) => {
      expect(
        determineInitialSyncCase(
          localBooks,
          localNotes,
          remoteBooks,
          remoteNotes,
        ),
      ).toBe(expected);
    },
  );
});
