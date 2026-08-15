import { useEffect, useState } from "react";
import type { ContainerPhoto } from "../domain";
import { watchPhotos } from "../repositories";
import { blobsFor } from "../photos/db";

export interface PhotoView {
  photo: ContainerPhoto;
  /** Local object URL while the bytes are still on this device. */
  localUrl?: string;
}

/**
 * Merges the Firestore metadata with whatever bytes are still local. A photo
 * taken thirty seconds ago in a basement has no download URL and must still
 * appear, which is why the local blob is preferred until the upload confirms.
 */
export function usePhotos(moveId: string | null, containerId: string | null): PhotoView[] {
  const [photos, setPhotos] = useState<ContainerPhoto[]>([]);
  const [views, setViews] = useState<PhotoView[]>([]);

  useEffect(() => {
    if (!moveId) {
      setPhotos([]);
      return;
    }
    return watchPhotos(moveId, setPhotos);
  }, [moveId]);

  useEffect(() => {
    if (!containerId) {
      setViews([]);
      return;
    }
    const mine = photos
      .filter((p) => p.containerId === containerId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const urls: string[] = [];
    let cancelled = false;

    void blobsFor(containerId).then((blobs) => {
      if (cancelled) return;
      const byId = new Map(blobs.map((b) => [b.photoId, b.blob]));
      const next = mine.map((photo) => {
        const blob = byId.get(photo.id);
        if (!blob) return { photo };
        const localUrl = URL.createObjectURL(blob);
        urls.push(localUrl);
        return { photo, localUrl };
      });
      setViews(next);
    });

    return () => {
      cancelled = true;
      // Object URLs leak until revoked, and this screen is opened often.
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [containerId, photos]);

  return views;
}
