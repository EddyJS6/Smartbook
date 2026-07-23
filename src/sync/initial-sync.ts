import type { InitialSyncCase } from "@/sync/types";

export function determineInitialSyncCase(
  localBooks: number,
  localNotes: number,
  remoteBooks: number,
  remoteNotes: number,
): Exclude<InitialSyncCase, "accountMismatch"> {
  const localFilled = localBooks > 0 || localNotes > 0;
  const remoteFilled = remoteBooks > 0 || remoteNotes > 0;
  if (localFilled && remoteFilled) return "bothFilled";
  if (localFilled) return "localOnly";
  if (remoteFilled) return "cloudOnly";
  return "bothEmpty";
}
