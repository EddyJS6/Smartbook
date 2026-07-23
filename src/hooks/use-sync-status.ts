"use client";

import { useCallback, useEffect, useState } from "react";
import type { SyncStatus } from "@/sync/types";
import { syncService } from "@/sync/sync-service";

const initialStatus: SyncStatus = {
  configured: false,
  online: true,
  running: false,
  pendingCount: 0,
  failedCount: 0,
  lastPushAt: null,
  lastPullAt: null,
  lastSuccessfulSyncAt: null,
  lastRestoreAt: null,
  firstSyncCompleted: false,
  associatedUserId: null,
};

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(initialStatus);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStatus(await syncService.getSyncStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const reload = () => {
      void syncService.getSyncStatus().then((nextStatus) => {
        if (active) {
          setStatus(nextStatus);
          setLoading(false);
        }
      });
    };
    reload();
    window.addEventListener("brainbook:sync-status", reload);
    window.addEventListener("brainbook:local-mutation", reload);
    window.addEventListener("online", reload);
    window.addEventListener("offline", reload);
    return () => {
      active = false;
      window.removeEventListener("brainbook:sync-status", reload);
      window.removeEventListener("brainbook:local-mutation", reload);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", reload);
    };
  }, []);

  return { status, loading, refresh };
}
