export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

export type PendingAttachment = {
  id: string;
  file: File;
  name: string;
  contentType: string;
  size: number;
};

export type OutboundAttachment = {
  filename: string;
  contentType: string;
  content: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Could not encode file'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function pendingAttachmentFromFile(file: File): PendingAttachment {
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  };
}

export function totalAttachmentBytes(items: PendingAttachment[]) {
  return items.reduce((sum, a) => sum + a.size, 0);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function canPreviewAttachment(contentType: string) {
  return contentType.startsWith('image/') || contentType === 'application/pdf';
}

export function openAttachmentBlob(blob: Blob, filename: string, contentType: string) {
  const url = URL.createObjectURL(blob);
  if (canPreviewAttachment(contentType)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function attachmentIcon(contentType: string) {
  if (contentType.startsWith('image/')) return 'ri-image-line';
  if (contentType === 'application/pdf') return 'ri-file-pdf-line';
  if (contentType.startsWith('text/')) return 'ri-file-text-line';
  return 'ri-file-line';
}

export async function serializeAttachments(
  items: PendingAttachment[]
): Promise<OutboundAttachment[]> {
  return Promise.all(
    items.map(async (item) => ({
      filename: item.name,
      contentType: item.contentType,
      content: await readFileAsBase64(item.file),
    }))
  );
}

export function validateNewAttachments(
  existing: PendingAttachment[],
  files: FileList | File[]
): string | null {
  const incoming = Array.from(files);
  if (!incoming.length) return null;
  if (existing.length + incoming.length > MAX_ATTACHMENTS) {
    return `You can attach up to ${MAX_ATTACHMENTS} files per email.`;
  }
  const nextTotal =
    totalAttachmentBytes(existing) + incoming.reduce((sum, f) => sum + f.size, 0);
  if (nextTotal > MAX_ATTACHMENT_BYTES) {
    return `Attachments must stay under ${formatFileSize(MAX_ATTACHMENT_BYTES)} total.`;
  }
  for (const file of incoming) {
    if (!file.size) return `"${file.name}" is empty.`;
  }
  return null;
}
