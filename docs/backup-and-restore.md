# Backup and restore

This procedure applies to a Docker deployment managed from the CartaVault
repository. Run the commands on the host that owns the Compose volumes. A
database dump alone is not a complete backup: it does not contain uploaded
photos, avatars, or the instance configuration.

## What must be protected

For each instance, protect the following as one recovery set:

- the PostgreSQL/PostGIS database;
- the `photos_data` and `avatars_data` volumes;
- `exports_data` only when active temporary exports must survive a recovery;
- the untracked `docker/.env` file (or the equivalent secret-manager entries),
  including database credentials, session secret, setup token, public URL and
  mail configuration;
- `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`.

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
docker compose -f docker/compose.yml exec -T postgres \
  pg_restore --list /dev/stdin < database.dump > /dev/null
```

At least quarterly, perform the isolated restore test below and sign off the
application smoke test. A checksum only proves that bytes survived; a restore
test proves that the recovery procedure still works.

## Automated backup

Use a dedicated host account that can run Docker Compose and a directory that
is not a CartaVault volume. For example, run daily at 02:15 UTC with cron:

```cron
15 2 * * * cd /srv/cartavault && /usr/bin/flock -n /var/lock/cartavault-backup.lock ./docker/backup.sh /srv/backups/cartavault >> /var/log/cartavault-backup.log 2>&1
```

Configure monitoring for a non-zero exit status, missing daily backup, and
unexpectedly small backup. Upload the resulting directory to encrypted,
off-host storage after the script finishes; the transfer must preserve
`SHA256SUMS`. Windows Task Scheduler may run the same command through a Linux
host, WSL, or a scheduled container job.

## Full restoration

Restoration replaces the configured database and media volumes. Stop any
writes first, choose the exact recovery directory, and explicitly acknowledge
the destructive action:

```sh
CARTAVAULT_RESTORE_CONFIRM=restore \
  ./docker/restore.sh /srv/backups/cartavault/20260729T120000Z
```

The script verifies checksums, stops frontend and backend, recreates and loads
the database, restores photos and avatars, restores exports when present (and
otherwise clears the temporary export volume), runs the version-matched
`migrate` job, and starts the application again. It fails if a required
database/photo/avatar artifact is missing. Never use it for a test against the
production Compose project.

After a production restore, check `docker compose ps`, the migration logs, an
administrator login, a representative map, one photo and (if enabled) a user
Google Routes credential. Retain the failed disk/volume state until these
checks pass.

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
   docker compose --project-name cartavault-restore-test -f docker/compose.yml up -d postgres
   CARTAVAULT_COMPOSE_PROJECT=cartavault-restore-test \
   CARTAVAULT_RESTORE_CONFIRM=restore \
     ./docker/restore.sh /srv/backups/cartavault/20260729T120000Z
   ```

5. Verify the application as described above. Destroy only the *isolated*
   test project after the test is accepted.

For an external PostgreSQL deployment, use `docker/compose.external.yml` and
prepare a separate empty target database; the configured database user must be
allowed to drop and create it.

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
