// Simple debug helpers gated by env flags. No functional changes for production.
export function isDebugFlag(flag: string): boolean {
  return process.env[flag] === '1' || process.env.DEBUG_LOGS === '1';
}

export function debugLog(enabled: boolean, ...args: any[]): void {
  if (enabled) console.log(...args);
}


