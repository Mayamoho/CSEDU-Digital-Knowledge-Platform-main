package library

import "testing"

// HID barcode scanners emulate a keyboard and append a terminator; some models
// send \r, some \n, some both. A stray terminator turns a valid barcode into a
// "member not found" at the circulation desk, so it is stripped defensively.
func TestCleanBarcode(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"plain member barcode", "M-A0000000", "M-A0000000"},
		{"plain item barcode", "B-1F2E3D4C", "B-1F2E3D4C"},
		{"scanner appends newline", "B-1F2E3D4C\n", "B-1F2E3D4C"},
		{"scanner appends carriage return", "B-1F2E3D4C\r", "B-1F2E3D4C"},
		{"scanner appends CRLF", "B-1F2E3D4C\r\n", "B-1F2E3D4C"},
		{"leading and trailing spaces from manual entry", "  M-A0000000  ", "M-A0000000"},
		{"space and terminator together", " B-1F2E3D4C \r\n", "B-1F2E3D4C"},
		{"empty input stays empty", "", ""},
		{"whitespace-only input collapses to empty", "  \r\n", ""},
		{"internal hyphen is preserved", "B-1F2E-3D4C", "B-1F2E-3D4C"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := cleanBarcode(tc.in); got != tc.want {
				t.Errorf("cleanBarcode(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
