package main

import "testing"

func TestMountData(t *testing.T) {
	tests := []struct {
		name   string
		access string
		want   string
	}{
		{
			name:   "read only uses bounded retries",
			access: "ro",
			want:   "vers=4,addr=192.0.2.10,proto=tcp,port=2049,soft,timeo=50,retrans=2",
		},
		{
			name:   "read write keeps kernel hard mount defaults",
			access: "rw",
			want:   "vers=4,addr=192.0.2.10,proto=tcp,port=2049",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mountData("192.0.2.10", tt.access)
			if got != tt.want {
				t.Fatalf("mountData() = %q, want %q", got, tt.want)
			}
		})
	}
}
