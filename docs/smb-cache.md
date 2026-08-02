# SMB game cache

SMB profiles can use a bounded rclone VFS cache to reduce loading pauses on
high-latency storage such as FRITZ!NAS. The setting is stored as `CACHE_MODE`
in the profile.

| Mode | RAM buffer per open file | Local cache limit | Read ahead | Maximum age |
| --- | ---: | ---: | ---: | ---: |
| `off` | 4 MB | none | none | none |
| `balanced` | 8 MB | 256 MB | 32 MB | 6 hours |
| `performance` | 16 MB | 1 GB | 64 MB | 24 hours |

New SMB profiles created in the TV UI default to `balanced`. Existing profiles
without `CACHE_MODE` continue to use `off` so an upgrade does not unexpectedly
consume internal storage.

Cached data is stored below:

```text
/var/lib/webosbrew/network-storage/cache/<profile-id>
```

Each profile has a separate cache directory. The size is enforced by rclone's
`--vfs-cache-max-size` option. Cache files are private to root and are not
exposed inside application jails.

The cache can only be cleared while the profile is disconnected. Use the TV UI
button **Cache leeren** or run:

```sh
webos-network-storage clear-cache <profile-id>
```

The feature currently applies only to SMB. NFS continues to rely on the Linux
page cache and NFS client buffering.
