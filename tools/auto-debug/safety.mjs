export function isCommandAllowed(command, allowlist) {
  if (!command) return false;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;
  for (const allowed of allowlist) {
    if (command === allowed) return true;
    if (command.startsWith(allowed)) return true;
  }
  return false;
}
