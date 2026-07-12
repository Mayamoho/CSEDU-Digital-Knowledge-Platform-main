// API Client for CSEDU Digital Knowledge Platform
// Connects to Go API Server (Port 8080)

// Use internal Docker network URL for server-side requests, external URL for client-side
const getApiBaseUrl = () => {
  // Server-side (during SSR/SSG)
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL || 'http://api:8080/api/v1';
  }
  // Client-side (in browser)
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1';
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
  detected_language?: string;
  query_rewritten?: boolean;
}

export interface ChatHistoryResponse {
  session_id: string;
  messages: Array<{
    query: string;
    response: string;
    source_ids: string[];
    model_used: string;
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
  private accessToken: string | null = null;

  constructor() {
    // Restore the token synchronously on the client so requests fired by
    // components that mount before AuthProvider's effect runs (e.g. research
    // grid/detail views) are still authenticated.
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('csedu_access_token');
    }
  }

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

  async updateMediaMetadata(itemId: string, metadata: Partial<MediaMetadata> & { title?: string }): Promise<MediaMetadata> {
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
  async getMyAddedBooks(params: { page?: number; per_page?: number } = {}): Promise<{ data: AddedBook[]; total: number }> {
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

  async getChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
    return this.request<ChatHistoryResponse>(`/ai/chat/history/${sessionId}`);
  }

  async summarizeDocument(itemId: string, language?: string): Promise<{ 
    item_id: string; 
    summary: string;
    model_used: string;
    detected_language?: string;
  }> {
    return this.request('/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, language: language || 'auto' }),
    });
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
    page?: number;
    per_page?: number;
  }): Promise<{ data: ResearchPaper[]; total: number; page?: number; per_page?: number; total_pages?: number; facets?: Facets }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.for_review) searchParams.append('for_review', 'true');
    if (params?.rtype) searchParams.append('rtype', params.rtype);
    if (params?.year) searchParams.append('year', params.year);
    if (params?.topic) searchParams.append('topic', params.topic);
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
    page?: number;
    per_page?: number;
  }): Promise<{ data: StudentProject[]; total: number; page?: number; per_page?: number; total_pages?: number; facets?: Facets }> {
    const sp = new URLSearchParams();
    if (params?.status) sp.append('status', params.status);
    if (params?.year) sp.append('year', params.year);
    if (params?.tech) sp.append('tech', params.tech);
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
}

export const apiClient = new APIClient();
