import { systemPreferences, shell } from 'electron';

export function checkAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(false);
}

export function promptAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.isTrustedAccessibilityClient(true);
}

export function openAccessibilitySettings(): void {
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  );
}
