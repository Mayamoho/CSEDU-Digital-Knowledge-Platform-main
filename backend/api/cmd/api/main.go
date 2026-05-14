package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/redis/go-redis/v9"

	"github.com/csedu/platform/api/internal/admin"
	"github.com/csedu/platform/api/internal/ai"
	"github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/db"
	"github.com/csedu/platform/api/internal/fine"
	"github.com/csedu/platform/api/internal/library"
	"github.com/csedu/platform/api/internal/loan"
	"github.com/csedu/platform/api/internal/media"
	"github.com/csedu/platform/api/internal/middleware"
	"github.com/csedu/platform/api/internal/projects"
	"github.com/csedu/platform/api/internal/research"
	"github.com/csedu/platform/api/internal/storage"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// Wait for init.sql to finish on first boot
	for i := 0; i < 20; i++ {
		var exists bool
		_ = pool.QueryRow(ctx,
			`SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_name = 'users'
			)`).Scan(&exists)
		if exists {
			break
		}
		log.Printf("api: waiting for schema... (%d/20)", i+1)
		time.Sleep(2 * time.Second)
	}

	minio, err := storage.NewMinio(context.Background())
	if err != nil {
		log.Fatalf("minio connect: %v", err)
	}

	authHandler := auth.NewHandler(pool)
	libraryHandler := library.NewHandler(pool)
	loanHandler := loan.NewHandler(pool, minio)
	fineHandler := fine.NewHandler(pool)

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr: "redis:6379",
	})

	aiHandler := ai.NewHandler(pool, redisClient)
	mediaHandler := media.NewHandler(pool, minio, redisClient)
	adminHandler := admin.NewHandler(pool)
	researchHandler := research.NewHandler(pool)
	projectsHandler := projects.NewHandler(pool)

	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Timeout(60 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// API v1
	r.Route("/api/v1", func(r chi.Router) {

		// ── Auth (public) ─────────────────────────────────────────────────
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.Post("/refresh", authHandler.Refresh)

			// Protected auth routes
			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Get("/me", authHandler.Me)
				r.Post("/logout", authHandler.Logout)
			})
		})

		// ── Library Catalog (public read, auth to borrow) ─────────────────
		r.Route("/library", func(r chi.Router) {
			// Catalog routes
			r.Route("/catalog", func(r chi.Router) {
				// Public GET access
				r.With(middleware.OptionalAuth).Get("/", libraryHandler.ListCatalog)
				r.With(middleware.OptionalAuth).Get("/{itemId}", libraryHandler.GetCatalogItem)
				
				// Librarian/admin POST access
				r.Group(func(r chi.Router) {
					r.Use(middleware.Authenticate)
					r.Use(middleware.RequireRole("librarian", "administrator"))
					r.Post("/", libraryHandler.AddBook)
				})
			})

			// Loan routes
			r.Route("/loans", func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Post("/", libraryHandler.BorrowBook)
				r.Get("/", libraryHandler.ListLoans)
				r.Post("/{loanId}/return", libraryHandler.ReturnBook)
				
				// Staff/admin only
				r.With(middleware.RequireRole("librarian", "administrator")).Get("/all", libraryHandler.ListAllLoans)
			})

			// Fine routes
			r.Route("/fines", func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Get("/", libraryHandler.ListFines)
				r.Post("/{fineId}/pay", libraryHandler.PayFine)
				
				// Staff/admin only
				r.With(middleware.RequireRole("librarian", "administrator")).Post("/{fineId}/waive", libraryHandler.WaiveFine)
			})
		})

		// ── Loans (dedicated loan service) ───────────────────────────────
		r.Route("/loans", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Post("/checkout", loanHandler.Checkout)
				r.Post("/{loanId}/return", loanHandler.Return)
				r.Get("/my-loans", loanHandler.GetMyLoans)
			})
		})

		// ── Fines ─────────────────────────────────────────────────
		r.Route("/fines", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Use(middleware.RequireRole("administrator", "librarian"))
				r.Post("/calculate", fineHandler.Calculate)
				r.Get("/overdue", fineHandler.GetOverdueFines)
				r.Post("/{fineId}/pay", fineHandler.PayFine)
			})
		})

		// ── Media ─────────────────────────────────────────────────────────
		r.Route("/media", func(r chi.Router) {
			r.Use(middleware.OptionalAuth)
			r.Get("/", mediaHandler.ListMedia)
			r.Get("/{itemId}", mediaHandler.GetMedia)
			r.Get("/{itemId}/download", mediaHandler.Download)

			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Post("/upload", mediaHandler.Upload)
				r.Get("/my-uploads", mediaHandler.MyUploads)
				r.Patch("/{itemId}/metadata", mediaHandler.UpdateMetadata)
			})
		})

		// ── Admin (librarian/administrator only) ───────────────────────────────────────
		r.Route("/admin", func(r chi.Router) {
			r.Use(middleware.Authenticate)
			r.Use(middleware.RequireRole("researcher", "librarian", "administrator"))

			r.Get("/users", adminHandler.ListUsers)
			r.Get("/catalog/export", adminHandler.ExportCatalogCSV)
			r.Post("/catalog/import", adminHandler.ImportCatalogCSV)
			r.Patch("/media/{itemId}/status", adminHandler.UpdateMediaStatus)

			// Admin-only sub-routes
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("administrator"))
				r.Patch("/users/{userId}/role", adminHandler.UpdateUserRole)
				r.Get("/audit-log", adminHandler.ListAuditLog)
			})
		})

		// AI Chat (authenticated users)
		r.Route("/ai", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Post("/chat", aiHandler.Chat)
				r.Get("/chat/history/{sessionId}", aiHandler.GetChatHistory)
				r.Post("/summarize", aiHandler.Summarize)
			})
		})

		// Research Papers (researchers can submit, staff can review)
		r.Route("/research", func(r chi.Router) {
			// Public/optional auth for listing and viewing
			r.With(middleware.OptionalAuth).Get("/", researchHandler.ListResearch)
			r.With(middleware.OptionalAuth).Get("/{paperId}", researchHandler.GetResearch)

			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Use(middleware.RequireRole("researcher", "administrator"))
				r.Post("/", researchHandler.SubmitResearch)
				r.Put("/{paperId}", researchHandler.UpdateResearch)
				r.Post("/{paperId}/submit-for-review", researchHandler.SubmitForReview)
				r.Post("/{paperId}/publish", researchHandler.PublishResearch)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Use(middleware.RequireRole("researcher", "administrator"))
				r.Post("/{paperId}/review", researchHandler.ReviewPaper)
			})
		})

		// Student Projects (students can submit, staff can approve)
		r.Route("/projects", func(r chi.Router) {
			// Public access to view published projects
			r.With(middleware.OptionalAuth).Get("/", projectsHandler.ListProjects)
			r.With(middleware.OptionalAuth).Get("/{projectId}", projectsHandler.GetProject)

			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Use(middleware.RequireRole("student", "researcher", "administrator"))
				r.Post("/", projectsHandler.SubmitProject)
				r.Put("/{projectId}", projectsHandler.UpdateProject)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.Authenticate)
				r.Use(middleware.RequireRole("librarian", "administrator"))
				r.Post("/{projectId}/approve", projectsHandler.ApproveProject)
			})
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("API server listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
