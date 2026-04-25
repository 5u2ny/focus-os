import type {
  Capture, Note, Todo, CalendarEvent,
  EmailDigestItem, UserCategory, Settings,
} from '@schema';

export interface IPCContracts {
  // Capture
  'capture:list':   { req: { limit?: number; category?: string }; res: Capture[] };
  'capture:save':   { req: { text: string; source: Capture['source'] }; res: Capture };
  'capture:delete': { req: { id: string }; res: void };
  'capture:pin':    { req: { id: string; pinned: boolean }; res: Capture };

  // Notes
  'notes:list':   { req: void; res: Note[] };
  'notes:get':    { req: { id: string }; res: Note | null };
  'notes:create': { req: { title?: string; content?: string }; res: Note };
  'notes:update': { req: { id: string; patch: Partial<Note> }; res: Note };
  'notes:delete': { req: { id: string }; res: void };

  // Todo
  'todo:list':      { req: void; res: Todo[] };
  'todo:create':    { req: { text: string; category?: string }; res: Todo };
  'todo:update':    { req: { id: string; patch: Partial<Todo> }; res: Todo };
  'todo:setActive': { req: { id: string | null }; res: void };
  'todo:delete':    { req: { id: string }; res: void };

  // Calendar
  'calendar:list':   { req: { from: number; to: number }; res: CalendarEvent[] };
  'calendar:create': { req: Omit<CalendarEvent, 'id'>; res: CalendarEvent };
  'calendar:delete': { req: { id: string }; res: void };

  // Gmail
  'gmail:connect':       { req: { email: string; appPassword: string }; res: { ok: boolean; error?: string } };
  'gmail:fetchNow':      { req: void; res: EmailDigestItem[] };
  'gmail:list':          { req: void; res: EmailDigestItem[] };
  'gmail:archive':       { req: { id: string }; res: void };
  'gmail:generateReply': { req: { id: string }; res: string };

  // Settings
  'focus:settings:get':    { req: void; res: Settings };
  'focus:settings:update': { req: Partial<Settings>; res: Settings };
  'focus:settings:setLLMKey': {
    req: { provider: 'anthropic' | 'openai'; key: string; model: string };
    res: void;
  };

  // Categories
  'category:list':   { req: void; res: UserCategory[] };
  'category:create': { req: { name: string; description: string; color: string }; res: UserCategory };
  'category:delete': { req: { id: string }; res: void };

  // Permissions
  'permission:checkAccessibility':    { req: void; res: boolean };
  'permission:openAccessibilitySettings': { req: void; res: void };

  // Window control
  'window:openNotes':    { req: { noteId?: string }; res: void };
  'window:toggleSidebar': { req: void; res: { expanded: boolean } };
  'window:openSettings': { req: void; res: void };
}

export type IPCChannel = keyof IPCContracts;
