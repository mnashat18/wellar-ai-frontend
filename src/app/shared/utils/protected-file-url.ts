export function protectedFileUrl(baseUrl: string, fileId: string | null | undefined): string | null {
  const id = typeof fileId === 'string' ? fileId.trim() : '';
  if (!id) return null;
  return `${baseUrl.replace(/\/+$/, '')}/wellar/files/${encodeURIComponent(id)}`;
}
