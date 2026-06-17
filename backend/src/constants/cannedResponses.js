/** Canned admin support replies. */
export const CANNED_RESPONSES = [
  { id: 'dns', label: 'DNS verification help', body: 'Please verify all DNS records (SPF, DKIM, DMARC, MAIL FROM) are published. Use Verify DNS in Domains and allow up to 48h for propagation.' },
  { id: 'pause', label: 'Sending paused explanation', body: 'Your account sending was paused due to elevated bounce/complaint rates. Please review your list hygiene and contact us when cleaned up.' },
  { id: 'billing', label: 'Billing / past due', body: 'Your subscription payment is past due. Update billing at Dashboard → Billing to restore sending.' },
  { id: 'quota', label: 'Quota exhausted', body: 'You have reached your monthly email quota. Upgrade your plan under Billing to send more this period.' },
  { id: 'close', label: 'Closing ticket', body: 'This issue appears resolved. We are closing this ticket — reply to reopen if you need further help.' },
];
