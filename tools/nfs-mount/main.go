package main

import (
	"fmt"
	"net"
	"os"
	"strings"
	"syscall"
)

func fail(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func resolveServer(server string) string {
	if ip := net.ParseIP(server); ip != nil {
		return server
	}
	ips, err := net.LookupIP(server)
	if err != nil {
		fail("cannot resolve NFS server %q: %v", server, err)
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
	}
	if len(ips) > 0 {
		return ips[0].String()
	}
	fail("NFS server %q has no usable address", server)
	return ""
}

func main() {
	if len(os.Args) != 5 {
		fail("usage: nfs-mount SERVER REMOTE_PATH TARGET ro|rw")
	}
	server, remote, target, access := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	if server == "" || !strings.HasPrefix(remote, "/") || target == "" {
		fail("invalid NFS mount arguments")
	}
	if access != "ro" && access != "rw" {
		fail("access must be ro or rw")
	}

	addr := resolveServer(server)
	flags := uintptr(0)
	if access == "ro" {
		flags |= syscall.MS_RDONLY
	}

	// webOS kernels provide the NFS/NFS4 filesystem but LG does not ship
	// mount.nfs. Supplying the NFS-specific mount data here lets us invoke
	// mount(2) directly without any external userspace helper.
	data := "vers=4,addr=" + addr + ",proto=tcp,port=2049"
	source := server + ":" + remote
	if err := syscall.Mount(source, target, "nfs4", flags, data); err != nil {
		fail("NFSv4 mount failed for %s at %s: %v", source, target, err)
	}
}
