# webOS Network Storage

`webos-network-storage` provides shared, read-only-by-default SMB and NFSv4
network mounts for native homebrew applications on rooted LG webOS TVs.

The project is intentionally independent of any emulator. A single SMB or
NFSv4 profile can be exposed to ScummVM, RetroArch, or other selected
application jails.

The downloadable IPK combines a Magic Remote-friendly TV interface, a narrow
Luna service, the privileged mount helper, the ARMv7 SMB/FUSE helper
`rclone-smb`, and the ARMv7 NFSv4 helper `nfs-mount`.

## Current scope

- multiple SMB and NFSv4 profiles managed on the TV;
- connection test, connect, disconnect, status, and profile removal;
- ScummVM selection by default plus RetroArch and detected application jails;
- one-time service elevation through an installed, rooted Homebrew Channel;
- automatic reconnect supervision and a boot startup hook;
- strict profile validation without evaluating profile contents as shell code;
- unique profile IDs and duplicate local mount-name protection;
- `validate`, `test`, `mount`, `unmount`, `status`, `expose`, and `autostart`
  commands, plus app-jail discovery with `list-apps`;
- read-only mounts by default;
- separate root-only SMB credentials;
- bind mounts into explicitly selected application jails;
- SMB read-buffer presets (`off`, `balanced`, and `performance`) without VFS
  disk caching;
- small ARMv7 `rclone-smb` build for webOS/FUSE;
- small ARMv7 `nfs-mount` helper that mounts NFSv4 directly through `mount(2)`;
- automatic `fusermount3` compatibility on webOS systems that provide only
  `fusermount`;
- app-readable mount and jail paths for non-root homebrew applications;
- shell and service tests plus an ARMv7 build workflow.

## Layout

```text
app/                            TV web application
service/                        narrow Luna service and profile store
bin/webos-network-storage       privileged mount helper
config/                         profile and credential examples
docs/architecture.md            component and security design
docs/smb-cache.md               SMB read-buffer presets
tools/rclone-smb                reduced rclone SMB/FUSE build
tools/nfs-mount                 direct NFSv4 mount helper
```

The default TV paths are:

```text
/var/lib/webosbrew/network-storage/profiles
/var/lib/webosbrew/network-storage/credentials
/var/lib/webosbrew/network-storage/runtime
/media/developer/network-storage/<mount-name>
```

## Profile examples

### SMB

Copy `config/profiles/games-smb.conf.example` to
`/var/lib/webosbrew/network-storage/profiles/games.conf` and adjust it:

```ini
PROTOCOL=smb
SERVER=192.0.2.10
REMOTE_PATH=Games
MOUNT_NAME=games
READ_ONLY=true
AUTO_CONNECT=true
APP_IDS=org.scummvm.scummvm com.retroarch
CACHE_MODE=balanced
```

SMB credentials are kept separately in
`/var/lib/webosbrew/network-storage/credentials/games.conf`:

```ini
USERNAME=network-storage
PASSWORD_OBSCURED=<output of rclone-smb obscure>
DOMAIN=WORKGROUP
```

Both files must be owned by root and mode `0600`. `PASSWORD_OBSCURED` prevents
accidental disclosure; it is not encryption against a user with root access.
No password is accepted as a command-line argument.

### NFSv4

The bundled NFS helper supports NFSv4 only. The remote path is relative to the
server's NFSv4 pseudoroot. For example, an OMV export exposed as `/games` is
configured like this:

```ini
DISPLAY_NAME=Games (NFSv4)
PROTOCOL=nfs
SERVER=192.0.2.10
REMOTE_PATH=/games
MOUNT_NAME=games
READ_ONLY=true
AUTO_CONNECT=true
APP_IDS=org.scummvm.scummvm com.retroarch
NFS_VERSION=4
```

See `config/profiles/games-nfs.conf.example` for the matching example profile.
NFSv3 is intentionally not supported.

## SMB read buffers

SMB profiles can tune in-memory read buffering without writing game data to the
TV's internal storage:

| Mode | RAM buffer per open file | Initial read chunk | Maximum read chunk |
| --- | ---: | ---: | ---: |
| `off` | 4 MB | 4 MB | 32 MB |
| `balanced` | 8 MB | 8 MB | 64 MB |
| `performance` | 16 MB | 16 MB | 128 MB |

All presets use `--vfs-cache-mode off`. New SMB profiles created in the TV UI
default to `balanced`; existing profiles without `CACHE_MODE` continue to use
`off`. See `docs/smb-cache.md` for details.

## Helper usage

```sh
webos-network-storage validate games
webos-network-storage test games
webos-network-storage mount games
webos-network-storage status games
webos-network-storage expose games
webos-network-storage list-apps
webos-network-storage unmount games
webos-network-storage autostart
```

`mount`, `unmount`, `test`, `expose`, and `autostart` require root. `autostart`
only mounts profiles with `AUTO_CONNECT=true`.

For local validation and tests, paths and external commands can be replaced
with `WNS_*` environment variables while `WNS_TEST_MODE=true`. These overrides
are intended only for the automated test suite.

## Target device

The initial target is webOS 6.5 on ARMv7.

For NFS, the tested webOS kernel provides the `nfs`/`nfs4` filesystems but LG
does not ship `mount.nfs` or a usable BusyBox `mount` applet for this use case.
The bundled `nfs-mount` helper therefore resolves the server and invokes
`mount(2)` directly using NFSv4 over TCP port 2049.

For SMB, the TV has no CIFS filesystem or `mount.cifs`. SMB therefore uses the
TV's existing FUSE support and the reduced `rclone-smb` binary.

## Install the IPK

For a stable version, download `com.rf1705.networkstorage_*_arm.ipk` from the
corresponding GitHub release. Every successful `Build` workflow also publishes
a downloadable build artifact containing the IPK and supporting files.

Install the IPK with webOS Dev Manager, `ares-install`, or the Homebrew Channel.

On the first launch, select **Jetzt einrichten**. The app asks the already
rooted Homebrew Channel to elevate only
`com.rf1705.networkstorage.service`. The service then installs three helper
binaries below `/var/lib/webosbrew/network-storage/bin`:

```text
webos-network-storage
rclone-smb
nfs-mount
```

It also installs the reconnect hook below `/var/lib/webosbrew`. No SMB password
is placed in a shell command or process argument.

The mount path is derived from the configured mount name:

```text
/media/developer/network-storage/<mount-name>
```

Select **ScummVM** in the profile. Inside ScummVM, add that same path as the
game directory. The service bind-mounts it into ScummVM's app jail when the
profile connects.

## Root requirement

The application UI can be installed in Developer Mode without root, but
creating the actual network mount is intentionally root-only. NFSv4 mounts and
bind mounts into another application's jail require mount privileges. SMB also
needs a bind mount to make its FUSE filesystem visible inside ScummVM or
another selected application. Therefore the complete ScummVM/RetroArch use
case requires a rooted TV and an elevated service.

## Builds and releases

Every push to `main` and every manual run of the `Build` workflow creates a
downloadable artifact containing the installable IPK, a standalone helper
archive, a Homebrew Channel manifest, and SHA-256 checksums.

To publish a GitHub release, start the workflow manually and enter a version
such as `vX.Y.Z`, or push a main-branch commit whose complete message is
`Release vX.Y.Z`. If no release version is supplied, only the build artifact is
generated. For release builds the workflow injects the requested version into
`app/appinfo.json` before packaging.
