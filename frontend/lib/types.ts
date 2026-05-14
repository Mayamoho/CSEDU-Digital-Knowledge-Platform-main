// CSEDU Digital Knowledge Platform - Type Definitions
// Based on SDD v1.0 Core Entities

// User Roles (RBAC) - Based on SDD Target User Groups
export type RoleTier = 'public' | 'student' | 'researcher' | 'librarian' | 'administrator';

// Media Status
export type MediaStatus = 'draft' | 'review' | 'published' | 'archived';

// Access Tiers
export type AccessTier = 'public' | 'student' | 'researcher' | 'librarian' | 'restricted';

// Fine Status
export type FineStatus = 'pending' | 'paid' | 'waived';

// Payment Status
export type PaymentStatus = 'pending' | 'successful' | 'failed';

// Hold Status
export type HoldStatus = 'active' | 'fulfilled' | 'cancelled';

// Research Status
export type ResearchStatus = 'draft' | 'review' | 'published';

// Project Status
export type ProjectStatus = 'draft' | 'approved' | 'published';

// Loan Status
export type LoanStatus = 'active' | 'returned' | 'overdue';

// Media Formats
export type MediaFormat = 
  | 'pdf' 
  | 'docx' 
  | 'doc' 
  | 'pptx' 
  | 'xlsx' 
  | 'mp4' 
  | 'mp3' 
  | 'jpg' 
  | 'png' 
  | 'gif';

// Role permissions mapping - Based on SDD Target User Groups
export const ROLE_PERMISSIONS: Record<RoleTier, string[]> = {
  public: [
    'view_public_catalog', 
    'search_public',
    'browse_archives',
    'view_projects',
    'download_public_research',
  ],
  student: [
    'view_public_catalog',
    'search_public',
    'borrow_books',
    'view_member_content',
    'upload_projects',
    'upload_research',
    'upload_archive',
    'use_ai_chat',
    'track_borrowing_history',
  ],
  researcher: [
    'view_public_catalog',
    'search_public',
    'borrow_books',
    'view_member_content',
    'upload_projects',
    'upload_research',
    'upload_archive',
    'use_ai_chat',
    'manage_research',
    'manage_media_metadata',
    'access_restricted_archives',
    'receive_ai_insights',
  ],
  librarian: [
    'view_public_catalog',
    'search_public',
    'view_member_content',
    'upload_projects',
    'use_ai_chat',
    'manage_catalog',
    'manage_loans',
    'manage_memberships',
    'track_overdues',
    'bulk_upload_catalog',
    'scan_barcodes',
    'answer_patron_queries',
  ],
  administrator: [
    'view_public_catalog',
    'search_public',
    'borrow_books',
    'view_member_content',
    'upload_projects',
    'upload_research',
    'upload_archive',
    'use_ai_chat',
    'manage_research',
    'manage_media_metadata',
    'access_restricted_archives',
    'receive_ai_insights',
    'manage_catalog',
    'manage_loans',
    'manage_memberships',
    'track_overdues',
    'bulk_upload_catalog',
    'scan_barcodes',
    'answer_patron_queries',
    'manage_users',
    'manage_permissions',
    'configure_ai_models',
    'monitor_ai_performance',
    'view_audit_logs',
  ],
};

// Check if a role has a specific permission
export function hasPermission(role: RoleTier, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check if user can access content based on access tier
export function canAccessContent(userRole: RoleTier, contentAccessTier: AccessTier): boolean {
  const accessHierarchy: Record<AccessTier, number> = {
    public: 0,
    student: 1,
    researcher: 2,
    librarian: 2,
    restricted: 3,
  };

  const roleAccessLevel: Record<RoleTier, number> = {
    public: 0,
    student: 1,
    researcher: 2,
    librarian: 2,
    administrator: 3,
  };

  return roleAccessLevel[userRole] >= accessHierarchy[contentAccessTier];
}

// Display names for roles
export const ROLE_DISPLAY_NAMES: Record<RoleTier, string> = {
  public: 'Public User',
  student: 'Student',
  researcher: 'Researcher',
  librarian: 'Librarian',
  administrator: 'Administrator',
};

// Display names for media status
export const STATUS_DISPLAY_NAMES: Record<MediaStatus, string> = {
  draft: 'Draft',
  review: 'Under Review',
  published: 'Published',
  archived: 'Archived',
};
