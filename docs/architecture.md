# Architecture

## Components

```text
TV web application
        |
        | Luna service calls
        v
network-storage Luna service
        |
        | execFile with fixed operations and validated profile IDs
        v
privileged network-storage helper
        |
        +-- NFS: kernel mount
        +-- SMB: rclone/FUSE
        +-- bind mounts into selected app jails
```

The application and service are packaged in one IPK. On first launch, the UI
uses the rooted Homebrew Channel's `elevateService` method for the fixed service
ID `com.rf1705.networkstorage.service`. After elevation, the service installs
the packaged helper binaries under `/var/lib/webosbrew/network-storage/bin`.
The UI never constructs or executes arbitrary root commands.

## Mount model

Each profile has one host mount:

```text
/media/developer/network-storage/<mount-name>
```

For every selected application, the same absolute path is bind-mounted below
its jail:

```text
/var/palm/jail/<app-id>/media/developer/network-storage/<mount-name>
```

Applications can therefore use a stable path. Missing jails are skipped rather
than created blindly; jail discovery and app lifecycle monitoring require
hardware verification before they become a background service.

## Profile and secret separation

General profile data lives in `profiles/<id>.conf`. SMB secrets live in
`credentials/<id>.conf`. The helper:

- accepts only profile IDs matching `[a-z0-9][a-z0-9_-]*`;
- reads values as data and never sources or evaluates configuration files;
- rejects unknown and duplicate keys;
- validates servers, mount names, protocols, booleans, NFS versions, and app
  IDs before invoking a system command;
- requires mode `0600` for profiles and credential files on the TV;
- never passes passwords on the command line;
- creates generated rclone configuration with mode `0600`.

The clear password arrives in the private service request and is sent to
`rclone obscure -` through stdin. It is not placed in a command line or log.
Only the obscured value is written to the root-only credential file. The
rclone-obscured password is reversible and only protects against accidental
plain-text disclosure; a user with root access can recover it.

## Mount behavior

Read-only is the default and examples enable it explicitly. Writable mounts
require `READ_ONLY=false`.

SMB uses small buffers and disables the VFS cache to limit storage and memory
use on the TV. NFS uses TCP and bounded retry timings. Unmounting first removes
all profile bind mounts and then the host mount.

## Startup and reconnect

The root service installs one `run-parts` hook at
`/var/lib/webosbrew/init.d/webos-network-storage`. It starts the helper's
supervision loop once per boot. Every 30 seconds the loop checks profiles with
`AUTO_CONNECT=true` and remounts those whose mount point disappeared.

Hardware validation is still required for the exact jail lifecycle on the
target webOS 6.5 TV. Missing jails are intentionally skipped; reconnecting or
selecting **Verbinden** exposes the mount again once a jail exists.
