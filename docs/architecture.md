# Architecture

## Components

```text
TV web application
        |
        | Luna service calls
        v
unprivileged webOS service
        |
        | fixed operations and validated profile IDs
        v
privileged network-storage helper
        |
        +-- NFS: kernel mount
        +-- SMB: rclone/FUSE
        +-- bind mounts into selected app jails
```

The first version implements the privileged helper and profile contract. The
web application and Luna service will be separate package components so the UI
never constructs or executes arbitrary root commands.

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

The rclone-obscured password is reversible and only protects against accidental
plain-text disclosure. A suitable webOS keystore interface will be investigated
before the settings UI stores credentials.

## Mount behavior

Read-only is the default and examples enable it explicitly. Writable mounts
require `READ_ONLY=false`.

SMB uses small buffers and disables the VFS cache to limit storage and memory
use on the TV. NFS uses TCP and bounded retry timings. Unmounting first removes
all profile bind mounts and then the host mount.

## Planned package layers

1. Root helper and profile contract.
2. Read-only TV inspection to verify jail paths, init hooks, and Luna service
   constraints.
3. Luna service with a narrow method allowlist and structured status.
4. Magic Remote-friendly web application.
5. IPK packaging, reconnect supervision, and release artifacts.

