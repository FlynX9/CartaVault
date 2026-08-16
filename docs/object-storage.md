# Photo object storage

CartaVault stores place and trip photos on the local filesystem by default.
SaaS or distributed installations can instead use a private S3-compatible
bucket without changing database records or exposing objects publicly.

## Backends

- `MEDIA_STORAGE=local` uses `PHOTO_STORAGE_PATH` and remains the self-hosted default.
- `MEDIA_STORAGE=s3` uploads originals and generated thumbnails to S3 and uses
  `MEDIA_CACHE_PATH` only as a disposable server-side cache.

Configure `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_REGION`.
`S3_ENDPOINT` enables OVH Object Storage, MinIO and other compatible services;
set `S3_FORCE_PATH_STYLE=true` when the provider requires path-style requests.
Keep TLS verification enabled in production.

The bucket must be private. CartaVault never returns a permanent public object
URL: normal map membership and media authorization run before the backend
materializes and serves an object. Object keys use CartaVault-generated UUIDs,
not user filenames. Existing content-signature, decoded image, size, dimension,
EXIF orientation and thumbnail processing checks apply to both backends.

## Migrate local photos

1. Back up PostgreSQL, the local photo tree and configuration.
2. Configure the `S3_*` values and `MEDIA_STORAGE=s3` on a staging copy.
3. Preview the copy operation:

   ```sh
   python -m scripts.migrate_photos_to_s3
   ```

4. Copy every original and generated thumbnail:

   ```sh
   python -m scripts.migrate_photos_to_s3 --apply
   ```

5. Verify photo display, thumbnails, download, KMZ/PDF export and deletion.
6. Switch production only after the staging verification succeeds.

The migration is repeatable and never deletes local files. Retaining the local
tree makes rollback possible by restoring `MEDIA_STORAGE=local`. Lifecycle,
versioning and deletion-retention policies remain the bucket operator's
responsibility and must match the database backup policy.
