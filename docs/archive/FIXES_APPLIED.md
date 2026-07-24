# Fixes Applied to CSEDU Digital Knowledge Platform

## Issues Fixed

### 1. Database Schema - Loans Table Constraint
**Problem**: The unique constraint `idx_loans_active_item` prevented multiple users from borrowing different copies of the same book.

**Fix**: Changed constraint from `(catalog_id)` to `(user_id, catalog_id)` to allow multiple users to borrow the same book while preventing duplicate borrows by the same user.

**File**: `infra/db/init.sql`
```sql
-- OLD (WRONG):
CREATE UNIQUE INDEX idx_loans_active_item
    ON loans (catalog_id)
    WHERE return_date IS NULL;

-- NEW (CORRECT):
CREATE UNIQUE INDEX idx_loans_active_user_item
    ON loans (user_id, catalog_id)
    WHERE return_date IS NULL;
```

**Database Migration Applied**:
```sql
DROP INDEX IF EXISTS idx_loans_active_item;
CREATE UNIQUE INDEX idx_loans_active_user_item ON loans (user_id, catalog_id) WHERE return_date IS NULL;
```

### 2. Borrow Book SQL Query
**Problem**: The SQL query used string concatenation for the interval parameter which caused PostgreSQL errors.

**Fix**: Changed to use a hardcoded interval value instead of parameter concatenation.

**File**: `api/internal/library/handlers.go`
```go
// OLD (WRONG):
loanPeriod := 14
tx.QueryRow(r.Context(),
    `INSERT INTO loans (user_id, catalog_id, due_date)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)
     RETURNING loan_id, to_char(due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    userID, req.CatalogID, loanPeriod,
)

// NEW (CORRECT):
tx.QueryRow(r.Context(),
    `INSERT INTO loans (user_id, catalog_id, due_date)
     VALUES ($1, $2, now() + interval '14 days')
     RETURNING loan_id, to_char(due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    userID, req.CatalogID,
)
```

### 3. API Routes - Catalog POST Endpoint
**Problem**: The POST route for `/library/catalog` was not properly registered due to middleware conflicts.

**Fix**: Restructured routes using nested `Route()` calls to properly separate GET (public) and POST (authenticated) handlers.

**File**: `api/cmd/api/main.go`
```go
// NEW STRUCTURE:
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
    // ... other routes
})
```

### 4. Add Book Handler
**Problem**: The handler was missing from the library package.

**Fix**: Added `AddBook` handler to `api/internal/library/handlers.go` with proper validation and error handling.

**Features**:
- Validates required fields (title, author)
- Handles ISBN uniqueness
- Sets default values for format and total_copies
- Returns catalog_id on success

### 5. Fines List Response Format
**Problem**: Backend response field names didn't match frontend expectations.

**Fix**: Updated response structure in `api/internal/library/handlers.go`:
- `amount` → `amount_bdt`
- `book_title` → `title`
- `calculated_at` → `created_at`
- `status` string → `paid` and `waived` booleans
- `total_pending` → `total_unpaid_bdt`

### 6. API Client Methods
**Problem**: Missing methods for add book and CSV import.

**Fix**: Added to `lib/api.ts`:
```typescript
async addBook(data: {
    title: string;
    author: string;
    isbn?: string;
    format?: string;
    location?: string;
    year?: number;
    total_copies?: number;
}): Promise<{ catalog_id: string; message: string }>

async importCatalogCSV(file: File): Promise<{ 
    inserted: number; 
    updated: number; 
    skipped: number; 
    total: number 
}>
```

### 7. Librarian Catalog Tools Component
**Problem**: Component had TODO placeholders instead of actual implementation.

**Fix**: Fully implemented in `components/catalog/librarian-catalog-tools.tsx`:
- Single book add form with all fields
- CSV upload with file selection
- Proper API calls with error handling
- Success toasts and page reload
- Form state management

### 8. Borrow Response Format
**Problem**: Response was missing the "message" field expected by frontend.

**Fix**: Added message field to borrow response:
```go
writeJSON(w, http.StatusCreated, map[string]string{
    "message":  "book borrowed successfully",
    "loan_id":  loanID,
    "due_date": dueDate,
})
```

## Data Verification

### Real Data (Not Mock)
The catalog contains real seed data from `infra/db/init.sql`:
- 12 computer science books
- Authors: Cormen, Gamma, Murphy, Russell, Tanenbaum, etc.
- ISBNs, locations, years, and copy counts
- All data is fetched from PostgreSQL database

### Public Access
- Catalog endpoints use `OptionalAuth` middleware
- Public users can view catalog without authentication
- Media items with `access_tier='public'` and `status='published'` are accessible
- RBAC properly filters content based on role tier

## How to Apply Fixes

Run the rebuild script:
```bash
./fix-and-rebuild.sh
```

Or manually:
```bash
# Stop all containers
docker compose down

# Rebuild API and Frontend
docker compose build --no-cache api frontend

# Start services
docker compose up -d postgres redis minio
sleep 15
docker compose up -d api frontend
```

## Testing

### Test Add Book (Librarian)
1. Login as librarian@cs.du.ac.bd (password: Staff@12345)
2. Go to Library Catalog
3. Click "Add Single Book"
4. Fill form and submit
5. Book should appear in catalog

### Test Borrow Book (Student)
1. Register a new user or login
2. Go to Library Catalog
3. Click on any available book
4. Click "Borrow Book"
5. Should see success message

### Test CSV Import (Librarian)
1. Login as librarian
2. Go to Library Catalog
3. Click "Bulk CSV Upload"
4. Upload CSV file with format: title,author,isbn,format,location,year,total_copies
5. Should see import results

## All Changes Persist
- Database schema changes applied via migration
- Go code changes require container rebuild (done)
- TypeScript changes require container rebuild (done)
- All fixes are in source files and will persist across restarts
