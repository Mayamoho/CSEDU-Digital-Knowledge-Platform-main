package ai

import (
	"regexp"
	"strings"
	"unicode"
)

// promptInjectionPatterns are obvious jailbreak / instruction-override attempts
// that the SDD §4.10 requires us to reject before forwarding to the RAG
// service. This is defense-in-depth: the grounded RAG prompt design is the
// primary mitigation, but obvious attempts are blocked at the API layer.
//
// NOTE: Go's regexp engine does not support inline (?i) flags, and the
// query is already lowercased by normalizeForInjectionCheck, so these
// patterns are written in lowercase only.
var promptInjectionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`ignore .*(instructions|prompts|context|rules)`),
	regexp.MustCompile(`disregard .*(instructions|prompt|context|rules)`),
	regexp.MustCompile(`(you are|act as|pretend to be|assume the role of) .*(different|new|unfiltered|jailbroken|evil|dan)\b`),
	regexp.MustCompile(`(forget|override|bypass|disable|ignore) .*(restrictions|guidelines|system|safety|rules)`),
	regexp.MustCompile(`(reveal|print|output|show|repeat) .*(system ?prompt|instructions|initial prompt)`),
	regexp.MustCompile(`developer mode`),
}

// zeroWidth is the set of invisible / confusable separators commonly used to
// obfuscate jailbreak strings.
var zeroWidth = map[rune]bool{
	0x200b: true, // ZERO WIDTH SPACE
	0x200c: true, // ZERO WIDTH NON-JOINER
	0x200d: true, // ZERO WIDTH JOINER
	0xfeff: true, // ZERO WIDTH NO-BREAK SPACE
	0x2060: true, // WORD JOINER
	0x2061: true, // FUNCTION APPLICATION
	0x2062: true, // INVISIBLE TIMES
	0x2063: true, // INVISIBLE SEPARATOR
	0x2064: true, // INVISIBLE PLUS
}

// detectPromptInjection returns true if the query looks like a known
// instruction-override attempt. Matched after collapsing common
// unicode/whitespace obfuscation.
func detectPromptInjection(query string) bool {
	normalized := normalizeForInjectionCheck(query)
	for _, re := range promptInjectionPatterns {
		if re.MatchString(normalized) {
			return true
		}
	}
	return false
}

// normalizeForInjectionCheck strips zero-width characters, normalizes common
// unicode look-alikes, lowercases, and collapses whitespace so simple
// obfuscation fails.
func normalizeForInjectionCheck(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		switch {
		case zeroWidth[r]:
			// drop entirely
		case r >= '０' && r <= '９':
			b.WriteRune('0' + (r - '０'))
		case r >= 'Ａ' && r <= 'Ｚ':
			b.WriteRune('a' + (r - 'Ａ'))
		case r >= 'ａ' && r <= 'ｚ':
			b.WriteRune('a' + (r - 'ａ'))
		case r == ' ' || r == '\t' || r == '\n' || r == '\r' || unicode.IsControl(r):
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
