package ai

import "testing"

// The three detail routes key off different ids: /research/{paper_id},
// /projects/{project_id}, /archive/{item_id}. Linking everything by item_id is
// what made cited papers and projects render "not found".
func TestDetailLink(t *testing.T) {
	paper := "11111111-1111-1111-1111-111111111111"
	project := "22222222-2222-2222-2222-222222222222"
	item := "33333333-3333-3333-3333-333333333333"

	cases := []struct {
		name     string
		itemType string
		paperID  *string
		project  *string
		want     string
	}{
		{"research uses paper_id", "research", &paper, nil, "/research/" + paper},
		{"project uses project_id", "project", nil, &project, "/projects/" + project},
		{"archive uses item_id", "archive", nil, nil, "/archive/" + item},
		// An orphaned paper has no working /research route, so it must not link
		// somewhere that 404s — the archive view renders any media item.
		{"research without a paper row falls back", "research", nil, nil, "/archive/" + item},
		{"project without a project row falls back", "project", nil, nil, "/archive/" + item},
		{"unknown type falls back", "something-else", nil, nil, "/archive/" + item},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := detailLink(c.itemType, item, c.paperID, c.project); got != c.want {
				t.Errorf("detailLink = %q, want %q", got, c.want)
			}
		})
	}

	// An empty string is as useless as a nil pointer.
	empty := ""
	if got := detailLink("research", item, &empty, nil); got != "/archive/"+item {
		t.Errorf("empty paper_id should fall back, got %q", got)
	}
}
