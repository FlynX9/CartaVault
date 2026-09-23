# Backup and restore

This procedure applies to a Docker deployment managed from the CartaVault
repository. Run the commands on the host that owns the Compose volumes. A
database dump alone is not a complete backup: it does not contain uploaded
photos, avatars, or the instance configuration.

## What must be protected

For each instance, protect the following as one recovery set:

- the PostgreSQL/PostGIS database;
- the `photos_data` and `avatars_data` volumes for local media, or the complete
  configured CartaVault S3 prefix plus `avatars_data` for S3 media;
- `exports_data` only when active temporary exports must survive a recovery;
- the untracked `docker/.env` file (or the equivalent secret-manager entries),
  including database credentials, session secret, setup token, public URL and
  mail configuration;
- `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`.

The `vector_maps_data` volume, or the Portainer/NAS `/data/maps` bind mount, is
not required in this recovery set. Country PMTiles are disposable derived
artifacts; `backup.sh` does not archive them. The database dump preserves the
country catalog and installation metadata, and missing archives are reported as
`PMTILES_MISSING` until an administrator regenerates them. A separate snapshot
of `/data/maps` is an optional optimization for avoiding that regeneration, not
an authoritative backup requirement.

The encryption key is deliberately excluded from `backup.sh`. Store it in an
access-controlled secret manager or an encrypted offline copy, separately from
the backup files. **If it is lost, the Google Routes credentials already stored
by users cannot be decrypted.** Replacing the key does not recover them.

Keep secrets out of shared backup folders and never commit an `.env` file.

## Manual backup

Before an upgrade and at regular intervals, create a timestamped backup:

```sh
./docker/backup.sh /srv/backups/cartavault
```

It checks PostgreSQL readiness and writes a directory such as
`/srv/backups/cartavault/20260729T120000Z` containing:

- `database.dump`, a PostgreSQL custom-format dump;
- `photos.tar.gz` and `avatars.tar.gz`;
- `manifest.txt` and `SHA256SUMS`.

Vector PMTiles are intentionally not included. The recovery set remains valid
when `vector_maps_data` is empty or absent.

For `MEDIA_STORAGE=s3`, the recovery set instead contains
`s3-objects.tar.gz`, `s3-objects.jsonl`, `s3-database-references.tsv` and
`avatars.tar.gz`. The archive contains the bytes for every object in the
configured CartaVault prefix, including retained orphan objects and generated
thumbnails. Each JSONL inventory row records a normalized relative key, byte
size, SHA-256 and Content-Type. The transport endpoint and credentials are not
stored; `manifest.txt` records only the logical bucket and prefix.

S3 backup requires a non-empty dedicated `S3_PREFIX`. This guard prevents
CartaVault tooling from copying or deleting a shared bucket root. The prefix is
the authoritative CartaVault namespace: objects outside it are never listed,
copied or deleted. Amazon S3, MinIO, OVH and other standard S3-compatible APIs
are designed targets; the integration matrix is tested with MinIO, not Amazon
S3.

To establish one explicit DB/S3 recovery point, `backup.sh` quiesces every
configured writer, dumps PostgreSQL, streams the complete S3 prefix to local
recovery files, and checks every Photo and TripNightPhoto reference against the
object inventory. It then captures local avatars/optional exports and restarts
the API before the worker. The entire DB/S3 capture is quiesced because ordinary
S3 APIs cannot atomically snapshot an unversioned prefix. Backup logs report
total and quiesce time. No object is loaded wholly into memory; transfer and
hashing are chunked per file.

Format 2 backups write `completed=true` and the separate `COMPLETED` marker only
after database inspection, S3 copy, reference validation, local archives and
all artifact checksums succeed. An interrupted or partial directory without
both values is invalid and must not be copied into retention as a completed
backup.

`backup.sh` and `restore.sh` derive the authoritative deployed file set from the
running API container's Docker Compose project/config-file labels. This means a
Redis deployment is resolved as the actual base-plus-Redis merge even when the
operator starts the command with only the base file. Redis mode is refused if
the configured worker and its deployed container cannot both be proven. When
deployed labels name files inside another client namespace, such as Portainer,
the explicit host files are accepted only after the deployed task mode and
worker containers prove the same writer set. A new-machine restore with no API
container uses its explicit file set as the deployment contract. The scripts
stop and verify the worker before attempting to stop the API, then
capture every authoritative component while all writers are quiesced. In local
mode this closes the former database/media timing gap. In Redis mode it also
prevents queued worker jobs from mutating PostgreSQL or media during the capture
window. A stop command returning success is not treated as proof: any configured
writer still reported as `running`, `restarting`, or `paused` aborts the
operation before protected capture, cutover, or rollback mutation.

`SHA256SUMS` uses relative artifact names so a completed recovery set can be
copied to another host. New backups checksum `manifest.txt` as well as the dump
and archives. The restore script also accepts the absolute checksum paths and
unchecksummed manifests produced by older CartaVault backups, but reports the
reduced legacy validation explicitly.

Exports are normally transient and are not copied. Include them only if an
operator has a recovery requirement for in-progress exports:

```sh
CARTAVAULT_BACKUP_EXPORTS=true ./docker/backup.sh /srv/backups/cartavault
```

For Portainer or Synology, point the script to the deployed Compose file and
project:

```sh
CARTAVAULT_COMPOSE_FILE=/path/to/compose.portainer.yml \
CARTAVAULT_COMPOSE_PROJECT=cartavault \
./docker/backup.sh /volume2/backups/cartavault
```

Copy the completed directory to a second, protected location before treating
the backup as valid. Do not copy a partially written directory.

## Integrity verification

Verify a backup immediately after copying it, and again before restoring it:

```sh
cd /srv/backups/cartavault/20260729T120000Z
sha256sum -c SHA256SUMS
```

All entries must report `OK`. Confirm the dump can be read without restoring
it:

```sh
docker compose -f docker/compose.yml exec -T postgis \
  pg_restore --list /dev/stdin < database.dump > /dev/null
```

At least quarterly, perform the isolated restore test below and sign off the
application smoke test. A checksum only proves that bytes survived; a restore
test proves that the recovery procedure still works.

## Automated backup

Use a dedicated host account that can run Docker Compose and a directory that
is not a CartaVault volume. For example, run daily at 02:15 UTC with cron:

```cron
15 2 * * * cd /srv/cartavault && ./docker/backup.sh /srv/backups/cartavault >> /var/log/cartavault-backup.log 2>&1
```

Both scripts require host `flock` and internally acquire the same nonblocking
lock for the deployed Compose project. The lock covers writer discovery,
quiescence, backup publication, restore staging/cutover/rollback, writer restart,
and cleanup. Backup-vs-backup, restore-vs-restore, and backup-vs-restore overlap
therefore fails immediately before protected work; an external cron lock is not
required. Kernel lock ownership releases automatically when the owning process
dies, without stale PID-file cleanup. Potentially long-lived child commands do
not inherit the lock descriptor.

Configure monitoring for a non-zero exit status, missing daily backup, and
unexpectedly small backup. Upload the resulting directory to encrypted,
off-host storage after the script finishes; the transfer must preserve
`SHA256SUMS`. Windows Task Scheduler may run the same command through a Linux
host, WSL, or a scheduled container job.

## Full restoration

The automated safe-restore workflow supports the standard Compose deployment
with its managed `postgis` service and local or S3 photo storage. Legacy
backups without format-2 S3 recovery data remain valid for local restores but
are refused for S3 restores before any live change.

Choose the exact recovery directory and explicitly acknowledge the operation:

```sh
CARTAVAULT_RESTORE_CONFIRM=restore \
  ./docker/restore.sh /srv/backups/cartavault/20260729T120000Z
```

The application remains available while the script:

1. validates required artifacts, manifest fields and checksums;
2. runs `pg_restore --list` against the custom-format database archive;
3. restores into a uniquely named staging database and checks the core schema;
4. extracts local media into isolated staging volumes, or uploads the verified
   S3 archive under `<S3_PREFIX>/.cartavault-restore/<restore-id>/stage/`;
5. rejects unsafe archive entries and checks every database-backed photo,
   night photo and avatar against the staged files. Photo and night-photo sizes
   are checked when `file_size_bytes` is available.

Only after those checks pass does the script quiesce all discovered writers. It
stops the optional worker before CartaVault, verifies that every configured writer
is stopped, and aborts before cutover if the barrier cannot be proven. It copies the
current local media into rollback volumes, renames the live database to a
uniquely named previous database, promotes the staging database, and copies the
validated staged media into the fixed Compose volumes. Database promotion is
performed before media replacement while the application is stopped. This is
not a cross-volume atomic operation; safety comes from retaining both the
previous database and complete previous media until post-validation succeeds.

The version-matched application entrypoint then applies any forward Alembic
migrations, exactly as it did in the previous restore contract. The restore
does not migrate the staging database before cutover and never runs an
automatic downgrade. Success requires bounded `/health/ready`, core database
queries, and a second live database/media correspondence check. Only then are
the previous database and staging/rollback volumes removed. A non-critical
cleanup failure is reported as a warning and leaves the validated replacement
serving.

If any operation fails after cutover begins, the script reacquires the writer
quiescence barrier before rollback. This second barrier is intentional because
the replacement API and worker may have been started before post-cutover
validation failed. If any writer cannot be stopped, the script prints `MANUAL
RECOVERY REQUIRED`, performs no database rename, media replacement, or S3
mutation, and preserves the recovery artifacts. Only after the second barrier is
proven does it restore previous local media/S3 state and the previous database,
then start the API, wait for readiness, and start the worker. If restart or
post-rollback validation fails, all recoverable artifacts remain available and
the command remains non-zero.

The restore needs temporary capacity for a second database plus staged and
rollback copies of local media. It prints filesystem availability before
staging, but operators must verify PostgreSQL and Docker data-root capacity for
their dataset. Staging normally increases total elapsed time while keeping the
service available; downtime begins only when the application is stopped for
rollback media capture and cutover.

For S3, preflight additionally requires the format-2 completion marker,
checksummed S3 archive/inventory/reference list, matching logical bucket and
prefix, exact object count/bytes, every object SHA-256, and live endpoint
access. Endpoint hostname is deliberately not part of the logical identity, so
a recovery can move between compatible transports while bucket/prefix mismatch
still fails closed. Cross-bucket/prefix restore is not automatic.

After preflight the recovery objects are uploaded to the reserved stage prefix
and downloaded again for count, size and SHA-256 validation. During cutover the
application is stopped, the current live namespace is copied and hashed under
the same restore ID's `previous/` prefix, then the safe database rename is
performed. The validated S3 stage replaces the live namespace exactly: objects
created after the backup are removed, but only inside the validated non-empty
CartaVault prefix. Copy/delete is not atomic; safety comes from quiescence and
the retained previous DB/S3 pair.

If S3 or readiness fails after cutover begins, rollback restores the exact
previous S3 inventory, then the previous database and local avatar/export
volumes, starts CartaVault, waits for readiness, and revalidates DB/S3
correspondence. Failure leaves the restore control prefix and database copies
for manual recovery and prints `MANUAL RECOVERY REQUIRED`. `SIGKILL`, host
failure and daemon loss remain untrappable. Recovery metadata at
`<S3_PREFIX>/.cartavault-restore/<restore-id>/recovery.json`, stage/previous
prefixes, and `cvrs_` databases identify the pair; subsequent backup/restore
refuses ambiguous leftovers.

Temporary capacity can reach one local S3 recovery archive plus remote stage
and previous namespace copies, as well as the staging/previous PostgreSQL
databases and local avatar/export copies. S3 providers can charge for GET, PUT,
COPY, LIST and DELETE operations. Versioning and SSE policies remain provider
configuration; tooling does not disable or replace them. It preserves
Content-Type, the only object metadata CartaVault currently uses.

Never use it for a test against the production Compose project.

After a production restore, check `docker compose ps`, the migration logs, an
administrator login, a representative map, one photo and (if enabled) a user
Google Routes credential. Retain the failed disk/volume state until these
checks pass.

The shared operation lock serializes backups and restores per Compose project.
`SIGINT` and `SIGTERM` before cutover clean staging; after cutover they invoke
rollback. `SIGKILL`, a host crash and power loss cannot be trapped. Staging and previous databases use
the `cvrs_` prefix and temporary media volumes carry
`com.cartavault.restore.*` labels. A subsequent backup or restore refuses to
proceed if such leftovers exist. Keep them for diagnosis and recover the
database/media pair manually before removing them and rerunning the script.

## Restore on a new machine or as a test

1. Install Docker Compose and obtain the same immutable CartaVault image set
   recorded in `manifest.txt` (or a version explicitly known to upgrade from
   it).
2. Copy the backup directory and securely restore `docker/.env` or recreate
   its values from the secret manager. The value of
   `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` must be the original value.
3. Create an isolated Compose project and use different published ports; do
   not reuse production volumes or the production project name.
4. Start PostgreSQL only, then run the restore with that isolated project:

   ```sh
   docker compose --project-name cartavault-restore-test -f docker/compose.yml up -d postgis
   CARTAVAULT_COMPOSE_PROJECT=cartavault-restore-test \
   CARTAVAULT_RESTORE_CONFIRM=restore \
     ./docker/restore.sh /srv/backups/cartavault/20260729T120000Z
   ```

   With no deployed API container, this restore-only bootstrap treats the
   explicit Compose file and project name as authoritative. Backup still
   requires the deployed API labels, and both workflows require a
   Compose-managed `postgis`.

5. Verify the application as described above. Destroy only the *isolated*
   test project after the test is accepted.

If the restored database contains vector basemap rows but the new machine has
no `/data/maps` contents, this is expected. Confirm readiness and online map
use first, then have an administrator open **Administration → General → Offline
map data** and choose **Update** for each previously installed country. Use
**Download and prepare** for countries that were not installed. Wait for
`Download → Generation → Validation → Available` before creating offline
packages. Regeneration requires network access to the controlled Geofabrik
extract, Java 21, the bundled Planetiler runtime, and the documented temporary
disk capacity; it is not performed automatically during restore.

`restore.sh` does not perform safe database staging/cutover for
`docker/compose.external.yml`, because that topology has no managed `postgis`
service. Restore external PostgreSQL through its provider's isolated
staging/snapshot procedure and validate it before connecting CartaVault.

## Retention and operational recommendations

Follow a 3-2-1 policy: retain at least three copies, on two kinds of storage,
with one encrypted off-site copy. A practical minimum is 14 daily backups, 8
weekly backups, and 12 monthly backups; extend this to meet legal or business
requirements. Encrypt backup storage, restrict read access, and test the
oldest retained monthly backup as well as recent backups.

Do not delete a recovery set until its successor has passed checksum and
off-site-copy verification. Store deployment secrets independently, rotate
them only through a planned migration, and record the CartaVault version and
restore-test date with each backup set.
