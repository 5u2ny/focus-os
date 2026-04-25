// ── Focus OS — shared data types ────────────────────────────────────────────
// Used by both the main process (via tsconfig.main.json) and the renderer
// (via @schema alias in vite.config.ts).

export interface Capture {
  id: string;
  text: string;
  source: 'highlight' | 'manual' | 'shortcut';
  sourceApp?: string;
  sourceUrl?: string;
  category?: string;
  imagePath?: string;
  createdAt: number;
  pinned: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;          // TipTap JSON serialized
  category?: string;
  capturedFromIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  category?: string;
  dueDate?: number;
  isActive: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  description?: string;
  category?: string;
}

export interface EmailDigestItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: number;
  importance: 'high' | 'medium' | 'low';
  summary?: string;
  draftReply?: string;
  read: boolean;
  archived: boolean;
}

export interface UserCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface Settings {
  hasCompletedOnboarding: boolean;
  hasGrantedAccessibility: boolean;
  captureShortcut: string;
  captureSilent: boolean;
  llmProvider?: 'anthropic' | 'openai';
  llmApiKeyEncrypted?: string;
  llmModel?: string;
  gmailEnabled: boolean;
  gmailEmail?: string;
  gmailAppPasswordEncrypted?: string;     // legacy: App Password path
  // OAuth2 path — works for Workspace accounts where App Passwords are blocked
  gmailOauthClientId?: string;
  gmailOauthClientSecretEncrypted?: string;
  gmailOauthRefreshTokenEncrypted?: string;
  gmailOauthAccessTokenEncrypted?: string;
  gmailOauthAccessTokenExpiresAt?: number; // ms epoch
  gmailFetchIntervalMin: number;
  gmailMaxResultsPerFetch: number;
  pillPosition: { x: number; y: number };
  pillEdge: 'top' | 'left' | 'right' | 'bottom';
  sidebarWidth: number;
  llmTelemetryConsent: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hasCompletedOnboarding: false,
  hasGrantedAccessibility: false,
  captureShortcut: 'CommandOrControl+Shift+C',
  captureSilent: false,
  gmailEnabled: false,
  gmailFetchIntervalMin: 15,
  gmailMaxResultsPerFetch: 20,
  pillPosition: { x: 100, y: 40 },
  pillEdge: 'top',
  sidebarWidth: 320,
  llmTelemetryConsent: false,
};

export const STORE_SCHEMA = {
  captures:       { type: 'array',  default: [] },
  notes:          { type: 'array',  default: [] },
  todos:          { type: 'array',  default: [] },
  calendarEvents: { type: 'array',  default: [] },
  emails:         { type: 'array',  default: [] },
  categories:     { type: 'array',  default: [] },
  settings: {
    type: 'object',
    default: DEFAULT_SETTINGS,
  },
} as const;

export interface StoreData {
  captures:       Capture[];
  notes:          Note[];
  todos:          Todo[];
  calendarEvents: CalendarEvent[];
  emails:         EmailDigestItem[];
  categories:     UserCategory[];
  settings:       Settings;
}
