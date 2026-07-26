// API Client for CSEDU Digital Knowledge Platform
// Connects to Go API Server (Port 8080)

// Use internal Docker network URL for server-side requests, external URL for client-side
const getApiBaseUrl = () => {
  // Server-side (during SSR/SSG)
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL || 'http://api:8080/api/v1';
  }
  // Client-side (in browser): same-origin relative path so it works on
  // any public host (devops.farefin.com, IP:8080, …). Nginx proxies /api/v1/*.
  return process.env.NEXT_PUBLIC_API_URL || '/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

export interface User {
  user_id: string;
  email: string;
  name: string;
  role_tier: 'public' | 'student' | 'researcher' | 'librarian' | 'administrator';
  created_at: string;
  last_login: string | null;
}

export interface Notification {
  notification_id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

export interface RoleRequest {
  request_id: string;
  requested_role: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  decision_notes: string;
  created_at: string;
  university_id: string;
  evidence_url: string;
  // Present only in the admin queue listing:
  user_id?: string;
  name?: string;
  email?: string;
  current_role?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: string;
}

export interface MediaItem {
  item_id: string;
  title: string;
  item_type: string;
  format: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  access_tier: 'public' | 'student' | 'researcher' | 'librarian' | 'restricted';
  created_by: string;
  upload_date: string;
  file_path: string | null;
  external_url?: string | null;
  paper_id?: string;
  project_id?: string;
  reviewer_id?: string;
  review_notes?: string;
  reviewed_at?: string;
  metadata?: MediaMetadata;
}

export interface MediaMetadata {
  meta_id: string;
  item_id: string;
  tags: string[];
  abstract: string;
  keywords: string[];
  language: string;
}

export interface LibraryCatalogItem {
  item_id: string;
  title: string;
  author: string;
  isbn: string | null;
  topic: string;
  format: string;
  status: 'available' | 'borrowed' | 'reserved';
  location: string | null;
  cover_image: string | null;
  year: number | null;
  total_copies: number;
  available_copies: number;
}

export interface LoanItem {
  loan_id: string;
  title: string;
  checkout_date: string;
  due_date: string;
  return_date: string | null;
  status: 'active' | 'returned' | 'overdue';
}

export interface HoldItem {
  hold_id: string;
  catalog_id: string;
  title: string;
  author: string;
  placed_at: string;
  expires_at: string | null;
  status: 'active' | 'fulfilled' | 'cancelled';
  queue_position: number;
}

export interface AdminLoanItem extends LoanItem {
  user_name: string;
  user_email: string;
  user_id: string;
}

export interface Fine {
  fine_id: string;
  loan_id: string;
  user_id: string;
  amount_bdt: number;
  paid: boolean;
  waived: boolean;
  created_at: string;
  paid_at: string | null;
  waived_at: string | null;
  waived_by: string | null;
  title?: string;
  due_date?: string;
  // A live payment session, if the member has started paying this fine.
  pending_method?: string | null;   // bkash | nagad | cash
  pending_status?: string | null;   // otp_sent | awaiting_counter
}

export interface AdminFine extends Fine {
  user_name: string;
  user_email: string;
}

// Result of starting a bKash/Nagad online payment (OTP challenge).
export interface InitiatePaymentResult {
  session_id: string;
  method: string;
  masked_account: string;
  amount_bdt: number;
  otp_expires_in: number;
  message: string;
  demo_otp?: string;        // present only in the simulated gateway
  demo_disclaimer?: string;
}

// A fine a member has asked to pay in person, awaiting librarian confirmation.
export interface CashRequest {
  session_id: string;
  fine_id: string;
  amount_bdt: number;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  title: string;
}

export interface CatalogTopic {
  topic: string;
  total: number;
  available: number;
}

export interface AddedBook {
  catalog_id: string;
  title: string;
  author: string;
  isbn?: string;
  topic?: string;
  format?: string;
  available_copies: number;
  total_copies: number;
  location?: string;
  cover_image?: string;
  year?: number;
}

export interface Payment {
  payment_id: string;
  fine_id: string;
  user_id: string;
  amount_bdt: number;
  payment_method: string;
  transaction_id: string | null;
  payment_date: string;
}

export interface ResearchPaper {
  paper_id: string;
  item_id: string;
  title: string;
  authors: string[];
  co_authors: string[];
  abstract: string;
  keywords: string[];
  publication_date?: string;
  doi?: string;
  journal?: string;
  conference?: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  access_tier: string;
  file_path?: string;
  created_by: string;
  submitted_at: string;
  reviewer_id?: string;
  review_notes?: string;
  reviewed_at?: string;
}

export interface StudentProject {
  project_id: string;
  item_id: string;
  title: string;
  team_members: string[];
  supervisor_id?: string;
  academic_year: number;
  course_code?: string;
  abstract: string;
  keywords: string[];
  status: 'draft' | 'review' | 'published' | 'archived';
  access_tier: string;
  file_path?: string;
  created_by: string;
  submitted_at: string;
  approved_by?: string;
  approved_at?: string;
  web_url?: string;
  github_repo?: string;
  app_download?: string;
}

// AI Chat types
export interface ChatResponse {
  response: string;
  sources: Array<{
    item_id: string;
    title: string;
    chunk_text?: string;
  }>;
  model_used: string;
  response_time: string;
  session_id: string;
  // Row this answer was stored as; needed to attach a rating (FR-AI-016).
  message_id?: string;
  detected_language?: string;
  query_rewritten?: boolean;
}

export interface ChatHistoryResponse {
  session_id: string;
  messages: Array<{
    message_id: string;
    query: string;
    response: string;
    source_ids: string[];
    model_used: string;
    rating: 1 | -1 | null;
    timestamp: string;
  }>;
}

// One selectable option in a hierarchical filter, with its live match count.
export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

// Facet buckets keyed by hierarchy level name (e.g. "format", "year", "tech").
export type Facets = Record<string, FacetBucket[]>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  facets?: Facets;
}

export interface SearchParams {
  q?: string;
  page?: number;
  per_page?: number;
  format?: string;
  status?: string;
  access_tier?: string;
  item_type?: string;
  // Hierarchical filter params (catalog/archive/research/projects).
  availability?: string;
  access?: string;
  year?: string;
  tech?: string;
  rtype?: string;
  topic?: string;
}

class APIClient {
  // Kept in memory only. The durable session lives in the HttpOnly `csedu_access`
  // cookie the API sets at login, which script on this page cannot read — so an
  // XSS bug can no longer walk off with a usable token. Every request below
  // sends credentials, so a page load with an empty in-memory token is still
  // authenticated by the cookie.
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async login(data: LoginRequest): Promise<AuthTokens> {
    return this.request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async register(data: RegisterRequest): Promise<{ user: User; tokens: AuthTokens }> {
    return this.request<{ user: User; tokens: AuthTokens }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.request<AuthTokens>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async logout(): Promise<void> {
    await this.request<void>('/auth/logout', {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Update the caller's own name/email.
  async updateProfile(data: { name: string; email: string }): Promise<User> {
    return this.request<User>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Change the caller's password (verifies the current one server-side).
  async changePassword(data: { current_password: string; new_password: string }): Promise<{ message: string }> {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Library Catalog endpoints
  async getLibraryCatalog(params: SearchParams = {}): Promise<PaginatedResponse<LibraryCatalogItem>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    return this.request<PaginatedResponse<LibraryCatalogItem>>(`/library/catalog?${searchParams.toString()}`);
  }

  // Topic-wise overview of the catalog — one entry per subject with counts.
  async getCatalogTopics(): Promise<{ data: CatalogTopic[]; total: number }> {
    return this.request(`/library/catalog/topics`);
  }

  async getLibraryItem(itemId: string): Promise<LibraryCatalogItem> {
    return this.request<LibraryCatalogItem>(`/library/catalog/${itemId}`);
  }

  // Borrow a book
  async borrowBook(catalogId: string): Promise<{ message: string; loan_id: string; due_date: string }> {
    return this.request(`/library/loans`, {
      method: 'POST',
      body: JSON.stringify({ catalog_id: catalogId }),
    });
  }

  // Circulation desk (librarian barcode workflow)
  async circulationCheckout(memberBarcode: string, itemBarcode: string): Promise<{
    message: string; loan_id: string; member_name: string; title: string; due_date: string;
  }> {
    return this.request(`/library/circulation/checkout`, {
      method: 'POST',
      body: JSON.stringify({ member_barcode: memberBarcode, item_barcode: itemBarcode }),
    });
  }

  async circulationReturn(itemBarcode: string): Promise<{
    message: string; loan_id: string; member_name: string; title: string;
  }> {
    return this.request(`/library/circulation/return`, {
      method: 'POST',
      body: JSON.stringify({ item_barcode: itemBarcode }),
    });
  }

  // Hold / reservation endpoints
  async placeHold(catalogId: string): Promise<{ message: string; hold_id: string; queue_position: number }> {
    return this.request(`/library/holds`, {
      method: 'POST',
      body: JSON.stringify({ catalog_id: catalogId }),
    });
  }

  async getMyHolds(): Promise<{ holds: HoldItem[] }> {
    return this.request(`/library/holds`);
  }

  async cancelHold(holdId: string): Promise<{ message: string }> {
    return this.request(`/library/holds/${holdId}`, { method: 'DELETE' });
  }

  // Media endpoints
  async getMediaItems(params: SearchParams = {}): Promise<PaginatedResponse<MediaItem>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    return this.request<PaginatedResponse<MediaItem>>(`/media?${searchParams.toString()}`);
  }

  async getMediaItem(itemId: string): Promise<MediaItem & { metadata: MediaMetadata }> {
    return this.request<MediaItem & { metadata: MediaMetadata }>(`/media/${itemId}`);
  }

  async uploadMedia(formData: FormData): Promise<MediaItem> {
    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/media/upload`, {
      credentials: 'include',
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  async replaceMediaFile(itemId: string, file: File): Promise<{ message: string; file_path: string; format: string }> {
    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/media/${itemId}/file`, {
      credentials: 'include',
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'File upload failed' }));
      throw new Error(error.message || 'File upload failed');
    }
    return response.json();
  }

  async updateMediaMetadata(itemId: string, metadata: Partial<MediaMetadata> & { title?: string; access_tier?: string; status?: string; external_url?: string }): Promise<MediaMetadata> {
    return this.request<MediaMetadata>(`/media/${itemId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(metadata),
    });
  }

  // Dashboard — user's loans
  async getMyLoans(): Promise<{ data: LoanItem[]; total: number }> {
    return this.request<{ data: LoanItem[]; total: number }>('/library/loans');
  }

  // Dashboard — user's uploaded media
  async getMyUploads(params: SearchParams = {}): Promise<PaginatedResponse<MediaItem>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request<PaginatedResponse<MediaItem>>(`/media/my-uploads?${searchParams.toString()}`);
  }

  // Return a borrowed book
  async returnBook(loanId: string): Promise<{ message: string }> {
    return this.request(`/library/loans/${loanId}/return`, { method: 'POST' });
  }

  // Download presigned URL
  async getDownloadUrl(itemId: string): Promise<{ url: string; expires_at: string }> {
    return this.request(`/media/${itemId}/download`);
  }

  // Permanently delete an owned media item (cascades to research/project rows and
  // the RAG vector_embeddings, removing it from the assistant everywhere).
  async deleteMedia(itemId: string): Promise<{ message: string }> {
    return this.request(`/media/${itemId}`, { method: 'DELETE' });
  }

  // Admin: list users
  async adminListUsers(params: { page?: number; per_page?: number } = {}): Promise<{ data: User[]; total: number; page: number; per_page: number }> {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) sp.append(k, String(v)); });
    return this.request(`/admin/users?${sp.toString()}`);
  }

  // Admin: change user role
  async adminUpdateRole(userId: string, roleTier: string): Promise<{ message: string }> {
    return this.request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role_tier: roleTier }),
    });
  }

  // Admin: update media status
  async adminUpdateMediaStatus(itemId: string, status: string): Promise<{ message: string }> {
    return this.request(`/admin/media/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // In-app notifications
  async listNotifications(): Promise<{ data: Notification[]; unread: number }> {
    return this.request(`/notifications`);
  }

  async markNotificationRead(id: string): Promise<{ message: string }> {
    return this.request(`/notifications/${id}/read`, { method: 'POST' });
  }

  async markAllNotificationsRead(): Promise<{ message: string }> {
    return this.request(`/notifications/read-all`, { method: 'POST' });
  }

  // Role-upgrade requests (self-service)
  async createRoleRequest(
    requestedRole: string,
    justification: string,
    universityId: string,
    evidenceUrl: string,
  ): Promise<{ request_id: string; status: string }> {
    return this.request(`/role-requests`, {
      method: 'POST',
      body: JSON.stringify({
        requested_role: requestedRole,
        justification,
        university_id: universityId,
        evidence_url: evidenceUrl,
      }),
    });
  }

  async listMyRoleRequests(): Promise<{ data: RoleRequest[] }> {
    return this.request(`/role-requests/mine`);
  }

  // Upload an identity-card scan/photo (PDF/PNG/JPG/HEIC) for a role request.
  // Returns the stored object key to submit as the request's evidence.
  async uploadRoleEvidence(file: File): Promise<{ evidence_url: string }> {
    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/role-requests/evidence`, {
      credentials: 'include',
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }
    return response.json();
  }

  // Admin: fetch a role request's uploaded identity card (auth required) and
  // return an object URL to open/preview. Legacy external links come back as
  // { url } JSON and are returned directly.
  async getRoleEvidenceObjectUrl(requestId: string): Promise<string> {
    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(`${API_BASE_URL}/admin/role-requests/${requestId}/evidence`, { headers, credentials: 'include' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Could not load evidence' }));
      throw new Error(error.message || 'Could not load evidence');
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data.url as string;
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  // Admin: role-request queue
  async adminListRoleRequests(status = 'pending'): Promise<{ data: RoleRequest[] }> {
    return this.request(`/admin/role-requests?status=${encodeURIComponent(status)}`);
  }

  async adminDecideRoleRequest(id: string, approve: boolean, notes = ''): Promise<{ status: string }> {
    return this.request(`/admin/role-requests/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ approve, notes }),
    });
  }

  // Admin: export catalog CSV — returns blob URL
  getCatalogExportUrl(): string {
    return `${API_BASE_URL}/admin/catalog/export`;
  }

  // Admin: import catalog CSV
  async importCatalogCSV(file: File): Promise<{ inserted: number; updated: number; skipped: number; total: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/admin/catalog/import`, {
      credentials: 'include',
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new Error(error.message || 'Import failed');
    }

    return response.json();
  }

  // Librarian: add a single book
  async addBook(data: {
    title: string;
    author: string;
    isbn?: string;
    topic?: string;
    format?: string;
    location?: string;
    year?: number;
    total_copies?: number;
  }): Promise<{ catalog_id: string; message: string }> {
    return this.request('/library/catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin: all loans
  async adminListLoans(params: { status?: string; page?: number; per_page?: number } = {}): Promise<{ data: AdminLoanItem[]; total: number }> {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) sp.append(k, String(v)); });
    return this.request(`/library/loans/all?${sp.toString()}`);
  }

  // Librarian: books this librarian has added to the catalog
  async getMyAddedBooks(params: { page?: number; per_page?: number } = {}): Promise<{ data: AddedBook[]; total: number; by_topic: { topic: string; count: number }[] }> {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) sp.append(k, String(v)); });
    return this.request(`/library/catalog/my-books?${sp.toString()}`);
  }

  // Fines
  async getMyFines(): Promise<{ data: Fine[]; total: number; total_unpaid_bdt: number }> {
    return this.request('/library/fines');
  }

  // Librarian/admin: every member's fines
  async adminListFines(): Promise<{ data: AdminFine[]; total: number; total_unpaid_bdt: number }> {
    return this.request('/library/fines/all');
  }

  // ── Fine payment: bKash/Nagad (OTP) + in-person cash ──────────────────────

  // Start an online payment; server "sends" an OTP to the wallet number.
  async initiateOnlinePayment(
    fineId: string,
    method: 'bkash' | 'nagad',
    accountNumber: string,
  ): Promise<InitiatePaymentResult> {
    return this.request(`/library/fines/${fineId}/pay/initiate`, {
      method: 'POST',
      body: JSON.stringify({ method, account_number: accountNumber }),
    });
  }

  // Verify the OTP and settle the fine.
  async confirmOnlinePayment(
    fineId: string,
    sessionId: string,
    otp: string,
  ): Promise<{ status: string; method: string; amount_bdt: number; message: string }> {
    return this.request(`/library/fines/${fineId}/pay/confirm`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, otp }),
    });
  }

  // Flag a fine to be paid in person; a librarian confirms it later.
  async requestCashPayment(
    fineId: string,
  ): Promise<{ session_id: string; status: string; amount_bdt: number; message: string }> {
    return this.request(`/library/fines/${fineId}/pay/cash`, { method: 'POST' });
  }

  async cancelPaymentSession(fineId: string): Promise<{ message: string }> {
    return this.request(`/library/fines/${fineId}/pay/cancel`, { method: 'POST' });
  }

  // Librarian/admin: fines awaiting in-person payment confirmation.
  async listCashRequests(): Promise<{ data: CashRequest[]; total: number }> {
    return this.request('/library/fines/cash-requests');
  }

  // Librarian/admin: confirm cash received at the counter, settling the fine.
  async confirmCashPayment(
    fineId: string,
  ): Promise<{ status: string; method: string; amount_bdt: number; message: string }> {
    return this.request(`/library/fines/${fineId}/confirm-cash`, { method: 'POST' });
  }

  async waiveFine(fineId: string, reason?: string): Promise<{ message: string }> {
    return this.request(`/library/fines/${fineId}/waive`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Waived by staff' }),
    });
  }

  // AI Chat
  async sendChatMessage(
    query: string, 
    sessionId?: string, 
    language?: string, 
    rewriteQuery?: boolean
  ): Promise<ChatResponse> {
    return this.request<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ 
        query, 
        session_id: sessionId,
        language: language || 'auto',
        rewrite_query: rewriteQuery || false
      }),
    });
  }

  // Opens the SSE chat stream. Returns the raw Response so the caller can read
  // response.body as a token stream. Throws if the stream can't be opened (the
  // widget then falls back to the non-streaming sendChatMessage).
  async streamChat(
    query: string,
    sessionId?: string,
    language?: string,
    rewriteQuery?: boolean
  ): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    const resp = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      credentials: 'include',
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        session_id: sessionId,
        language: language || 'auto',
        rewrite_query: rewriteQuery || false,
      }),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`stream failed: ${resp.status}`);
    }
    return resp;
  }

  async getChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
    return this.request<ChatHistoryResponse>(`/ai/chat/history/${sessionId}`);
  }

  async summarizeDocument(itemId: string, language?: string): Promise<{
    item_id: string;
    summary: string;
    key_points: string[];
    word_count: number;
    model_used: string;
    cached?: boolean;
  }> {
    return this.request('/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, language: language || 'auto' }),
    });
  }

  // FR-AI-009 / FR-AI-010: structured extraction. `kind` defaults to the item's
  // own type, so a research paper returns findings/methodology/conclusion and a
  // student project returns technologies/skills/outcome.
  async getInsights(
    itemId: string,
    kind: 'auto' | 'summary' | 'research' | 'project' = 'auto',
    language?: string
  ): Promise<AIInsights> {
    return this.request<AIInsights>('/ai/insights', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, kind, language: language || 'auto' }),
    });
  }

  // FR-AI-016: rate an answer the assistant gave. `messageId` comes back from
  // sendChatMessage, or from the trailing `stored` event on the SSE stream.
  async submitAIFeedback(messageId: string, rating: 1 | -1, note?: string): Promise<{ message: string }> {
    return this.request('/ai/feedback', {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId, rating, note }),
    });
  }

  // FR-AI-017
  async getRecommendations(): Promise<{ recommendations: Recommendation[]; personalized: boolean }> {
    return this.request('/ai/recommendations');
  }

  // FR-AI-015 (administrators only)
  async getAIMetrics(): Promise<AIMetrics> {
    return this.request<AIMetrics>('/admin/ai-metrics');
  }

  // Drill-down behind a stat card or a bar on the usage chart.
  async getAIMetricsDetail(
    panel: 'users' | 'helpful' | 'unhelpful' | 'citations' | 'day',
    day?: string
  ): Promise<{ panel: string; rows: AIMetricDetailRow[] }> {
    const qs = new URLSearchParams({ panel });
    if (day) qs.set('day', day);
    return this.request(`/admin/ai-metrics/detail?${qs.toString()}`);
  }

  // FR-TXX-015: content version history
  async getVersions(itemId: string): Promise<{ item_id: string; versions: MediaVersion[] }> {
    return this.request(`/media/${itemId}/versions`);
  }

  async restoreVersion(itemId: string, versionNo: number): Promise<{ message: string; restored_from: number }> {
    return this.request(`/media/${itemId}/versions/${versionNo}/restore`, { method: 'POST' });
  }

  // Research Papers
  async submitResearch(data: {
    title: string;
    authors: string[];
    co_authors: string[];
    abstract: string;
    keywords: string[];
    publication_date?: string;
    doi?: string;
    journal?: string;
    conference?: string;
    file_path: string;
  }): Promise<{ message: string; paper_id: string; item_id: string }> {
    return this.request('/research', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateResearch(paperId: string, data: {
    title: string;
    authors: string[];
    co_authors: string[];
    abstract: string;
    keywords: string[];
    publication_date?: string;
    doi?: string;
    journal?: string;
    conference?: string;
  }): Promise<{ message: string }> {
    return this.request(`/research/${paperId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async listResearch(params?: {
    status?: string;
    for_review?: boolean;
    rtype?: string;
    year?: string;
    topic?: string;
    q?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ data: ResearchPaper[]; total: number; page?: number; per_page?: number; total_pages?: number; facets?: Facets }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.for_review) searchParams.append('for_review', 'true');
    if (params?.rtype) searchParams.append('rtype', params.rtype);
    if (params?.year) searchParams.append('year', params.year);
    if (params?.topic) searchParams.append('topic', params.topic);
    if (params?.q) searchParams.append('q', params.q);
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.per_page) searchParams.append('per_page', String(params.per_page));
    return this.request(`/research?${searchParams.toString()}`);
  }

  async getResearch(paperId: string): Promise<ResearchPaper> {
    return this.request(`/research/${paperId}`);
  }

  async submitResearchForReview(paperId: string): Promise<{ message: string }> {
    return this.request(`/research/${paperId}/submit-for-review`, {
      method: 'POST',
    });
  }

  async publishResearch(paperId: string): Promise<{ message: string }> {
    return this.request(`/research/${paperId}/publish`, {
      method: 'POST',
    });
  }

  async reviewResearch(paperId: string, approved: boolean, notes: string): Promise<{ message: string; status: string }> {
    return this.request(`/research/${paperId}/review`, {
      method: 'POST',
      body: JSON.stringify({ approved, notes }),
    });
  }

  // Student Projects
  async submitProject(data: {
    title: string;
    team_members: string[];
    supervisor_id?: string;
    academic_year: number;
    course_code?: string;
    abstract: string;
    keywords: string[];
    file_path?: string;
    web_url?: string;
    github_repo?: string;
    app_download?: string;
  }): Promise<{ message: string; project_id: string; item_id: string }> {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(projectId: string, data: {
    title: string;
    team_members: string[];
    supervisor_id?: string;
    academic_year: number;
    course_code?: string;
    abstract: string;
    keywords: string[];
    web_url?: string;
    github_repo?: string;
    app_download?: string;
  }): Promise<{ message: string }> {
    return this.request(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async listProjects(params?: {
    status?: string;
    year?: string;
    tech?: string;
    q?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ data: StudentProject[]; total: number; page?: number; per_page?: number; total_pages?: number; facets?: Facets }> {
    const sp = new URLSearchParams();
    if (params?.status) sp.append('status', params.status);
    if (params?.year) sp.append('year', params.year);
    if (params?.tech) sp.append('tech', params.tech);
    if (params?.q) sp.append('q', params.q);
    if (params?.page) sp.append('page', String(params.page));
    if (params?.per_page) sp.append('per_page', String(params.per_page));
    return this.request(`/projects?${sp.toString()}`);
  }

  async getProject(projectId: string): Promise<StudentProject> {
    return this.request(`/projects/${projectId}`);
  }

  async approveProject(projectId: string, approved: boolean, notes?: string): Promise<{ message: string; status: string }> {
    return this.request(`/projects/${projectId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved, notes }),
    });
  }

  // Resource reviews & ratings
  async listReviews(itemId: string): Promise<{ reviews: ResourceReview[]; average: number; count: number }> {
    return this.request(`/reviews/${itemId}`);
  }

  async submitReview(itemId: string, rating: number, body: string): Promise<{ message: string }> {
    return this.request(`/reviews/${itemId}`, {
      method: 'POST',
      body: JSON.stringify({ rating, body }),
    });
  }
}

export interface AIInsights {
  item_id: string;
  kind: string;
  title: string;
  item_type: string;
  summary: string;
  word_count: number;
  key_points: string[];
  key_findings?: string[];
  methodology?: string;
  conclusion?: string;
  technologies?: string[];
  skills?: string[];
  outcome?: string;
  model_used: string;
  cached?: boolean;
}

export interface Recommendation {
  kind: 'book' | 'media';
  id: string;
  title: string;
  subtitle?: string;
  item_type?: string;
  reason: string;
  available?: boolean;
}

export interface AIMetrics {
  summary: {
    total_queries: number;
    queries_24h: number;
    queries_7d: number;
    unique_users: number;
    sessions: number;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    rated_helpful: number;
    rated_unhelpful: number;
    answers_with_citations: number;
  };
  by_model: { model: string; count: number; avg_latency_ms: number | null }[];
  daily: { day: string; count: number }[];
  recent_unhelpful: { query: string; model_used: string; note: string | null; created_at: string }[];
}

export interface AIMetricDetailRow {
  primary: string;
  secondary?: string;
  count?: number;
  meta?: string;
  link?: string;
}

export interface MediaVersion {
  version_no: number;
  title: string;
  abstract: string;
  keywords: string[];
  tags: string[];
  language: string;
  access_tier: string;
  status: string;
  format: string;
  file_path: string | null;
  change_note: string;
  changed_by: string | null;
  created_at: string;
}

export interface ResourceReview {
  review_id: string;
  item_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  body: string;
  created_at: string;
}

export const apiClient = new APIClient();
