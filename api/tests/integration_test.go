//go:build integration

// Integration tests (SDD §8.2).
//
// These exercise handlers against a real PostgreSQL — the unit tests already
// cover pure logic, and the bugs that actually reached production here were SQL
// ones (a text/uuid cast, an array parameter inferred as text) that only a real
// database can catch.
//
// Run:
//
//	TEST_DATABASE_URL=postgres://csedu_user:pass@localhost:5432/csedu_test \
//	  go test -tags=integration ./tests/...
//
// Without TEST_DATABASE_URL the whole file skips, so `go test ./...` stays
// green on a laptop with no database.
package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/csedu/platform/api/internal/ai"
	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/media"
	"github.com/csedu/platform/api/internal/middleware"
	"github.com/csedu/platform/api/internal/notify"
	"github.com/csedu/platform/api/internal/versioning"
)

var pool *pgxpool.Pool

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		os.Exit(0) // nothing to integrate against
	}
	var err error
	pool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		panic("cannot connect to TEST_DATABASE_URL: " + err.Error())
	}
	defer pool.Close()
	os.Exit(m.Run())
}

// userSeq keeps seeded emails unique, so calling seedUser twice in one test
// really does produce two different people.
var userSeq atomic.Int64

// seedUser creates a throwaway user and returns its id plus a valid bearer token.
func seedUser(t *testing.T, role string) (string, string) {
	t.Helper()
	var userID string
	email := fmt.Sprintf("it-%s-%d@test.local",
		strings.ReplaceAll(t.Name(), "/", "-"), userSeq.Add(1))
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO users (email, name, role_tier) VALUES ($1, 'Integration Test', $2)
		 ON CONFLICT (email) DO UPDATE SET role_tier = EXCLUDED.role_tier
		 RETURNING user_id::text`, email, role).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
	})

	token, _, err := authpkg.IssueAccessToken(userID, role)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return userID, token
}

// seedItem creates a published media item owned by userID.
func seedItem(t *testing.T, userID, itemType, title string) string {
	t.Helper()
	var itemID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO media_items (title, item_type, format, status, access_tier, created_by)
		 VALUES ($1, $2, 'pdf', 'published', 'public', $3) RETURNING item_id::text`,
		title, itemType, userID).Scan(&itemID); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO media_metadata (item_id, abstract, keywords, tags, language)
		 VALUES ($1, 'original abstract', ARRAY['graphs'], ARRAY['algorithms'], 'en')`,
		itemID); err != nil {
		t.Fatalf("seed metadata: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM media_items WHERE item_id = $1`, itemID)
	})
	return itemID
}

func authed(req *http.Request, token string) *http.Request {
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

// TestVersionHistoryRoundTrip is the FR-TXX-015 acceptance criteria end to end:
// an edit is tracked, the previous version is retrievable, and restoring it
// brings the old values back.
func TestVersionHistoryRoundTrip(t *testing.T) {
	userID, token := seedUser(t, "researcher")
	itemID := seedItem(t, userID, "research", "Original Title")

	h := media.NewHandler(pool, nil, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Patch("/media/{itemId}/metadata", h.UpdateMetadata)
	r.Get("/media/{itemId}/versions", h.ListVersions)
	r.Post("/media/{itemId}/versions/{versionNo}/restore", h.RestoreVersion)

	// 1. Edit the item.
	body := `{"title":"Revised Title","abstract":"revised abstract","keywords":["trees"]}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("PATCH", "/media/"+itemID+"/metadata", strings.NewReader(body)), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("edit returned %d: %s", rec.Code, rec.Body.String())
	}

	// 2. The pre-edit state must be retrievable.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("GET", "/media/"+itemID+"/versions", nil), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("list versions returned %d: %s", rec.Code, rec.Body.String())
	}
	var listed struct {
		Versions []struct {
			VersionNo int      `json:"version_no"`
			Title     string   `json:"title"`
			Abstract  string   `json:"abstract"`
			Keywords  []string `json:"keywords"`
		} `json:"versions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode versions: %v", err)
	}
	if len(listed.Versions) != 1 {
		t.Fatalf("want 1 archived version, got %d", len(listed.Versions))
	}
	if listed.Versions[0].Title != "Original Title" {
		t.Errorf("version 1 title = %q, want %q", listed.Versions[0].Title, "Original Title")
	}
	if listed.Versions[0].Abstract != "original abstract" {
		t.Errorf("version 1 abstract = %q, want the pre-edit value", listed.Versions[0].Abstract)
	}

	// 3. Restoring brings the old values back on the live row.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("POST", "/media/"+itemID+"/versions/1/restore", nil), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("restore returned %d: %s", rec.Code, rec.Body.String())
	}

	var title, abstract string
	if err := pool.QueryRow(context.Background(),
		`SELECT m.title, mm.abstract FROM media_items m
		   JOIN media_metadata mm ON mm.item_id = m.item_id
		  WHERE m.item_id = $1`, itemID).Scan(&title, &abstract); err != nil {
		t.Fatalf("read restored item: %v", err)
	}
	if title != "Original Title" || abstract != "original abstract" {
		t.Errorf("after restore got (%q, %q), want the original values", title, abstract)
	}

	// The restore is itself an edit, so it must be undoable too.
	var count int
	pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM media_versions WHERE item_id = $1`, itemID).Scan(&count)
	if count != 2 {
		t.Errorf("want 2 archived versions after restore, got %d", count)
	}
}

// TestVersionHistoryDeniedForStrangers: history exposes abstracts and file
// paths, so it must follow the same ownership rule as editing.
func TestVersionHistoryDeniedForStrangers(t *testing.T) {
	ownerID, _ := seedUser(t, "researcher")
	itemID := seedItem(t, ownerID, "research", "Someone Else's Paper")

	_, token := seedUser(t, "student")

	h := media.NewHandler(pool, nil, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Get("/media/{itemId}/versions", h.ListVersions)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("GET", "/media/"+itemID+"/versions", nil), token))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("stranger got %d, want 403", rec.Code)
	}
}

// TestAIFeedback covers FR-AI-016: a user can rate their own answer, cannot
// rate someone else's, and an invalid rating is rejected.
func TestAIFeedback(t *testing.T) {
	userID, token := seedUser(t, "student")

	var messageID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO ai_chat_messages (session_id, user_id, query, response, model_used, latency_ms)
		 VALUES (gen_random_uuid(), $1, 'what is a b-tree', 'a balanced tree', 'groq/test', 900)
		 RETURNING message_id::text`, userID).Scan(&messageID); err != nil {
		t.Fatalf("seed chat message: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM ai_chat_messages WHERE message_id = $1`, messageID)
	})

	h := ai.NewHandler(pool, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Post("/ai/feedback", h.SubmitFeedback)

	post := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed(httptest.NewRequest("POST", "/ai/feedback", strings.NewReader(body)), token))
		return rec
	}

	if rec := post(`{"message_id":"` + messageID + `","rating":1}`); rec.Code != http.StatusOK {
		t.Fatalf("rating returned %d: %s", rec.Code, rec.Body.String())
	}
	var rating int16
	pool.QueryRow(context.Background(),
		`SELECT rating FROM ai_chat_messages WHERE message_id = $1`, messageID).Scan(&rating)
	if rating != 1 {
		t.Errorf("stored rating = %d, want 1", rating)
	}

	// Re-rating overwrites — a rating is an opinion, not an append-only log.
	if rec := post(`{"message_id":"` + messageID + `","rating":-1,"note":"missed the point"}`); rec.Code != http.StatusOK {
		t.Fatalf("re-rating returned %d", rec.Code)
	}
	var note *string
	pool.QueryRow(context.Background(),
		`SELECT rating, feedback_note FROM ai_chat_messages WHERE message_id = $1`,
		messageID).Scan(&rating, &note)
	if rating != -1 || note == nil || *note != "missed the point" {
		t.Errorf("after re-rating got (%d, %v), want (-1, \"missed the point\")", rating, note)
	}

	if rec := post(`{"message_id":"` + messageID + `","rating":5}`); rec.Code != http.StatusBadRequest {
		t.Errorf("rating 5 returned %d, want 400", rec.Code)
	}

	// A different user must not be able to rate this message.
	_, otherToken := seedUser(t, "student")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("POST", "/ai/feedback",
		strings.NewReader(`{"message_id":"`+messageID+`","rating":1}`)), otherToken))
	if rec.Code != http.StatusNotFound {
		t.Errorf("foreign rating returned %d, want 404", rec.Code)
	}
}

// TestRecommendationsRespectAccessTier covers FR-AI-017 together with
// FR-AI-007: a suggestion must never point at something the user cannot open.
func TestRecommendationsRespectAccessTier(t *testing.T) {
	ownerID, _ := seedUser(t, "researcher")
	restricted := seedItem(t, ownerID, "archive", "Restricted Dossier")
	if _, err := pool.Exec(context.Background(),
		`UPDATE media_items SET access_tier = 'restricted' WHERE item_id = $1`, restricted); err != nil {
		t.Fatalf("set access tier: %v", err)
	}

	_, token := seedUser(t, "student")

	h := ai.NewHandler(pool, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Get("/ai/recommendations", h.Recommendations)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("GET", "/ai/recommendations", nil), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("recommendations returned %d: %s", rec.Code, rec.Body.String())
	}

	var out struct {
		Recommendations []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"recommendations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode recommendations: %v", err)
	}
	for _, item := range out.Recommendations {
		if item.ID == restricted {
			t.Fatalf("restricted item %q was recommended to a student", item.Title)
		}
	}
}

// TestCookieSessionAuthenticates is the non-SRS hardening: the HttpOnly session
// cookie must authenticate a request on its own, with no Authorization header.
func TestCookieSessionAuthenticates(t *testing.T) {
	_, token := seedUser(t, "student")

	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Get("/probe", func(w http.ResponseWriter, req *http.Request) {
		id, ok := authpkg.GetUserID(req)
		if !ok || id == "" {
			t.Error("handler ran without a user id in context")
		}
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/probe", nil)
	req.AddCookie(&http.Cookie{Name: authpkg.AccessCookieName, Value: token})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("cookie-only request returned %d, want 200", rec.Code)
	}

	// And no credentials at all must still be rejected.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/probe", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous request returned %d, want 401", rec.Code)
	}
}

// TestResearchEditIsVersioned is the regression for the bug this fixed: the
// research and project edit dialogs write straight to media_items and
// media_metadata, so version history stayed empty however many times an author
// revised their work. Snapshotting only inside the media handler was not enough.
func TestResearchEditIsVersioned(t *testing.T) {
	userID, _ := seedUser(t, "researcher")
	itemID := seedItem(t, userID, "research", "Draft One")

	if versioning.Snapshot(context.Background(), pool, itemID, userID, "paper edited") == 0 {
		t.Fatal("snapshot returned 0 — nothing was recorded")
	}

	// Apply the edit the way the research handler does.
	if _, err := pool.Exec(context.Background(),
		`UPDATE media_items SET title = 'Draft Two' WHERE item_id = $1`, itemID); err != nil {
		t.Fatalf("apply edit: %v", err)
	}

	var no int
	var title, note string
	if err := pool.QueryRow(context.Background(),
		`SELECT version_no, title, change_note FROM media_versions
		  WHERE item_id = $1 ORDER BY version_no DESC LIMIT 1`, itemID,
	).Scan(&no, &title, &note); err != nil {
		t.Fatalf("read version: %v", err)
	}
	if no != 1 || title != "Draft One" || note != "paper edited" {
		t.Errorf("got v%d %q (%q), want v1 \"Draft One\" (\"paper edited\")", no, title, note)
	}

	// Version numbers must keep climbing across successive edits.
	if second := versioning.Snapshot(context.Background(), pool, itemID, userID, "paper edited"); second != 2 {
		t.Errorf("second snapshot = v%d, want v2", second)
	}
}

// TestChatHistoryCarriesRating: a reopened conversation must still be ratable,
// which means the history has to hand back message_id and any rating already
// given. Without those the thumbs silently vanish on every reload.
func TestChatHistoryCarriesRating(t *testing.T) {
	userID, token := seedUser(t, "student")

	var sessionID, messageID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO ai_chat_messages (session_id, user_id, query, response, model_used, latency_ms, rating)
		 VALUES (gen_random_uuid(), $1, 'q', 'a', 'groq/test', 100, 1)
		 RETURNING session_id::text, message_id::text`, userID).Scan(&sessionID, &messageID); err != nil {
		t.Fatalf("seed message: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM ai_chat_messages WHERE message_id = $1`, messageID)
	})

	h := ai.NewHandler(pool, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Get("/ai/chat/history/{sessionId}", h.GetChatHistory)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("GET", "/ai/chat/history/"+sessionID, nil), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("history returned %d: %s", rec.Code, rec.Body.String())
	}

	var out struct {
		Messages []struct {
			MessageID string `json:"message_id"`
			Rating    *int   `json:"rating"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode history: %v", err)
	}
	if len(out.Messages) != 1 {
		t.Fatalf("want 1 message, got %d", len(out.Messages))
	}
	if out.Messages[0].MessageID != messageID {
		t.Errorf("message_id = %q, want %q", out.Messages[0].MessageID, messageID)
	}
	if out.Messages[0].Rating == nil || *out.Messages[0].Rating != 1 {
		t.Errorf("rating = %v, want 1", out.Messages[0].Rating)
	}
}

// TestCitationLinksResolveDetailIds is the regression for cited papers and
// projects rendering "not found" on the metrics dashboard: the citation panel
// linked everything by item_id, but /research/{id} expects a paper_id and
// /projects/{id} a project_id.
func TestCitationLinksResolveDetailIds(t *testing.T) {
	userID, token := seedUser(t, "administrator")

	paperItem := seedItem(t, userID, "research", "Cited Paper")
	projectItem := seedItem(t, userID, "project", "Cited Project")
	archiveItem := seedItem(t, userID, "archive", "Cited Archive Doc")

	var paperID, projectID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO research_papers (item_id, authors) VALUES ($1, ARRAY['A'])
		 RETURNING paper_id::text`, paperItem).Scan(&paperID); err != nil {
		t.Fatalf("seed paper: %v", err)
	}
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO student_projects (item_id, academic_year) VALUES ($1, 2025)
		 RETURNING project_id::text`, projectItem).Scan(&projectID); err != nil {
		t.Fatalf("seed project: %v", err)
	}

	// One chat message citing all three.
	var messageID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO ai_chat_messages (session_id, user_id, query, response, model_used, source_doc_ids)
		 VALUES (gen_random_uuid(), $1, 'cite everything', 'here', 'groq/test',
		         ARRAY[$2,$3,$4]::uuid[])
		 RETURNING message_id::text`,
		userID, paperItem, projectItem, archiveItem).Scan(&messageID); err != nil {
		t.Fatalf("seed chat message: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM ai_chat_messages WHERE message_id = $1`, messageID)
	})

	h := ai.NewHandler(pool, nil)
	r := chi.NewRouter()
	r.Use(middleware.Authenticate)
	r.Get("/admin/ai-metrics/detail", h.AdminMetricsDetail)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed(httptest.NewRequest("GET", "/admin/ai-metrics/detail?panel=citations", nil), token))
	if rec.Code != http.StatusOK {
		t.Fatalf("citations panel returned %d: %s", rec.Code, rec.Body.String())
	}

	var out struct {
		Rows []struct {
			Primary string `json:"primary"`
			Link    string `json:"link"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}

	want := map[string]string{
		"Cited Paper":       "/research/" + paperID,
		"Cited Project":     "/projects/" + projectID,
		"Cited Archive Doc": "/archive/" + archiveItem,
	}
	seen := map[string]bool{}
	for _, row := range out.Rows {
		if expect, ok := want[row.Primary]; ok {
			seen[row.Primary] = true
			if row.Link != expect {
				t.Errorf("%q linked to %q, want %q", row.Primary, row.Link, expect)
			}
		}
	}
	for title := range want {
		if !seen[title] {
			t.Errorf("%q missing from the citations panel", title)
		}
	}
}

// TestDownloadNotifiesReaders covers the download-notification mechanism: a
// reader who downloaded a paper is told when the author revises it, the author
// is not told about their own edit, and someone who never downloaded it is left
// alone.
func TestDownloadNotifiesReaders(t *testing.T) {
	authorID, _ := seedUser(t, "researcher")
	readerID, _ := seedUser(t, "student")
	bystanderID, _ := seedUser(t, "student")

	itemID := seedItem(t, authorID, "research", "Shared Paper")

	// The reader and the author both took a copy; the bystander did not.
	notify.RecordDownload(context.Background(), pool, itemID, readerID)
	notify.RecordDownload(context.Background(), pool, itemID, authorID)

	// A repeat download must not create a second row — we notify people once.
	notify.RecordDownload(context.Background(), pool, itemID, readerID)
	var rows, count int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*)::int, COALESCE(MAX(download_count), 0)
		   FROM media_downloads WHERE item_id = $1 AND user_id = $2`,
		itemID, readerID).Scan(&rows, &count); err != nil {
		t.Fatalf("read downloads: %v", err)
	}
	if rows != 1 || count != 2 {
		t.Errorf("got %d row(s) with count %d, want 1 row counting 2 downloads", rows, count)
	}

	// Anonymous downloads have nobody to notify and must not be recorded.
	notify.RecordDownload(context.Background(), pool, itemID, "")

	notified := notify.NotifyDownloaders(context.Background(), pool, itemID, authorID,
		"A paper you downloaded has been revised", "body text", "/research")
	if notified != 1 {
		t.Fatalf("notified %d people, want 1 (the reader, not the author)", notified)
	}

	assertNotified := func(userID string, want int, who string) {
		var n int
		pool.QueryRow(context.Background(),
			`SELECT COUNT(*)::int FROM notifications
			  WHERE user_id = $1 AND title = 'A paper you downloaded has been revised'`,
			userID).Scan(&n)
		if n != want {
			t.Errorf("%s has %d notification(s), want %d", who, n, want)
		}
	}
	assertNotified(readerID, 1, "reader")
	assertNotified(authorID, 0, "author (excluded)")
	assertNotified(bystanderID, 0, "bystander (never downloaded)")
}
