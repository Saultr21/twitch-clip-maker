const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%/;

export function parseYtDlpProgress(line: string): number | null {
  const match = PROGRESS_RE.exec(line);
  if (!match) return null;
  return Math.min(100, parseFloat(match[1]));
}
