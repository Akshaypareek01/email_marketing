import {
  formatFileSize,
  pendingAttachmentFromFile,
  serializeAttachments,
  type OutboundAttachment,
  type PendingAttachment,
} from './attachments';

export const SUPPORT_MAX_ATTACHMENTS = 3;
export const SUPPORT_MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/**
 * Validate files for support ticket attachments.
 */
export function validateSupportAttachments(
  existing: PendingAttachment[],
  files: FileList | File[]
): string | null {
  const incoming = Array.from(files);
  if (!incoming.length) return null;
  if (existing.length + incoming.length > SUPPORT_MAX_ATTACHMENTS) {
    return `Maximum ${SUPPORT_MAX_ATTACHMENTS} attachments per message.`;
  }
  for (const file of incoming) {
    if (!file.size) return `"${file.name}" is empty.`;
    if (file.size > SUPPORT_MAX_ATTACHMENT_BYTES) {
      return `"${file.name}" exceeds ${formatFileSize(SUPPORT_MAX_ATTACHMENT_BYTES)}.`;
    }
  }
  return null;
}

export {
  pendingAttachmentFromFile,
  serializeAttachments,
  formatFileSize,
  type OutboundAttachment,
  type PendingAttachment,
};

/**
 * Download a base64-encoded ticket attachment in the browser.
 */
export function downloadTicketAttachment(
  filename: string,
  contentType: string,
  content: string
): void {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
