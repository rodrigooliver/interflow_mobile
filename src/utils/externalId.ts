/**
 * Utilitários para formatação de External ID — espelha src/utils/externalId.ts (web).
 */

export function cleanExternalId(externalId: string | null | undefined): string {
  if (!externalId) return '';
  return externalId
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@broadcast$/i, '')
    .trim();
}

function isNumericOnly(value: string): boolean {
  return /^\d+$/.test(value);
}

export function formatBrazilianPhone(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  if (
    cleanPhone.startsWith('55') &&
    (cleanPhone.length === 12 || cleanPhone.length === 13)
  ) {
    const countryCode = cleanPhone.slice(0, 2);
    const areaCode = cleanPhone.slice(2, 4);
    const phoneNumber = cleanPhone.slice(4);
    if (phoneNumber.length === 8) {
      return `+${countryCode} (${areaCode}) ${phoneNumber.slice(0, 4)}-${phoneNumber.slice(4)}`;
    }
    if (phoneNumber.length === 9) {
      return `+${countryCode} (${areaCode}) ${phoneNumber.slice(0, 5)}-${phoneNumber.slice(5)}`;
    }
  }
  return cleanPhone || phone;
}

export function formatExternalId(externalId: string | null | undefined): string {
  if (!externalId) return '';
  const cleaned = cleanExternalId(externalId);
  if (!cleaned) return '';
  if (isNumericOnly(cleaned)) {
    return formatBrazilianPhone(cleaned);
  }
  return cleaned;
}
