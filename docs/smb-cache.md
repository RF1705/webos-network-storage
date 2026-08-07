# SMB read buffer presets

SMB profiles can tune rclone's in-memory read buffer and SMB read chunk sizes.
The setting remains stored as `CACHE_MODE` for compatibility with profiles
created by earlier development builds.

| Mode | RAM buffer per open file | Initial read chunk | Maximum read chunk |
| --- | ---: | ---: | ---: |
| `off` | 4 MB | 4 MB | 32 MB |
| `balanced` | 8 MB | 8 MB | 64 MB |
| `performance` | 16 MB | 16 MB | 128 MB |

All three presets use:

```text
--vfs-cache-mode off
```

No game data is copied to the TV's internal storage. This avoids the additional
flash writes and first-read stalls observed with rclone's full VFS disk cache.
The presets only affect SMB. NFS continues to rely on the Linux page cache and
NFS client buffering.

New SMB profiles created in the TV UI default to `balanced`. Existing profiles
without `CACHE_MODE` continue to use `off`.

Older development versions may have left data below:

```text
/var/lib/webosbrew/network-storage/cache/<profile-id>
```

That old cache is no longer used and can be removed after disconnecting the
profile.
