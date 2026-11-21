import QRCode from 'qrcode';
import { Customer } from '../types';

export const KRUEGER_BUSINESS_CARD = {
  company: 'Krueger Painting',
  owner: 'Joshua Krueger',
  firstName: 'Joshua',
  lastName: 'Krueger',
  displayName: 'Joshua Krueger — Krueger Painting',
  title: 'Owner / Painting & Drywall Contractor',
  phoneDisplay: '262-443-1199',
  phoneE164: '+1-262-443-1199',
  email: 'krueptg@gmail.com',
  websiteDisplay: 'kruegerpaintingwi.com',
  websiteUrl: 'https://kruegerpaintingwi.com',
  addressLine: 'N630 Moraine Dr., Campbellsport, WI 53010',
  street: 'N630 Moraine Dr.',
  city: 'Campbellsport',
  state: 'WI',
  zip: '53010',
  country: 'USA',
} as const;

export interface QrMatrixData {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

/**
 * Generates an offline, vector-exact QR matrix for any URL (defaults to kruegerpaintingwi.com).
 */
export function getQrMatrix(text: string = KRUEGER_BUSINESS_CARD.websiteUrl): QrMatrixData {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  return {
    size,
    isDark: (row: number, col: number) => Boolean(qr.modules.get(row, col)),
  };
}

function escapeVcardText(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

function splitFullName(fullName: string): { first: string; last: string } {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { first: 'Client', last: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return { first, last };
}

export interface ParsedUsAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/**
 * Parses a free-form US street address into structured vCard ADR components
 * (street, city, state, ZIP, country).
 */
export function parseStructuredUsAddress(rawAddress?: string | null): ParsedUsAddress {
  const raw = (rawAddress || '').trim().replace(/\s+/g, ' ');
  if (!raw) {
    return { street: '', city: '', state: '', zip: '', country: '' };
  }

  // Try comma-separated segments first: "1425 Main St, West Bend, WI 53095" or "Street, City, WI, 53095"
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    const tail = parts.slice(2).join(' ').trim();
    const stateZipMatch = tail.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      return {
        street,
        city,
        state: stateZipMatch[1].toUpperCase(),
        zip: stateZipMatch[2],
        country: 'USA',
      };
    }
    const stateOnly = tail.match(/^([A-Za-z]{2})\b/);
    const zipOnly = tail.match(/\b(\d{5}(?:-\d{4})?)\b/);
    return {
      street,
      city,
      state: stateOnly ? stateOnly[1].toUpperCase() : tail,
      zip: zipOnly ? zipOnly[1] : '',
      country: 'USA',
    };
  }

  if (parts.length === 2) {
    const street = parts[0];
    const second = parts[1];
    // Handle "1425 Main St, West Bend WI 53095"
    const cityStateZip = second.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (cityStateZip) {
      return {
        street,
        city: cityStateZip[1].trim(),
        state: cityStateZip[2].toUpperCase(),
        zip: cityStateZip[3],
        country: 'USA',
      };
    }
    const cityState = second.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (cityState) {
      return {
        street,
        city: cityState[1].trim(),
        state: cityState[2].toUpperCase(),
        zip: '',
        country: 'USA',
      };
    }
    return {
      street,
      city: second,
      state: '',
      zip: '',
      country: 'USA',
    };
  }

  // Single-string fallback without commas: try matching trailing "WI 53095"
  const trailingStateZip = raw.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (trailingStateZip) {
    return {
      street: trailingStateZip[1].trim(),
      city: '',
      state: trailingStateZip[2].toUpperCase(),
      zip: trailingStateZip[3],
      country: 'USA',
    };
  }

  return { street: raw, city: '', state: '', zip: '', country: 'USA' };
}

/**
 * Formats a customer's initial first-saved timestamp (createdAt) as a clean human-readable date
 * such as "Nov 21, 2026". Falls back cleanly to today's date if not yet recorded.
 */
export function formatCustomerFirstSavedDate(createdAt?: string | number | null): string {
  let d: Date;
  if (createdAt) {
    const parsed = new Date(createdAt);
    d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    d = new Date();
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Generates a standard vCard 3.0 (.vcf) for a Krueger Painting customer.
 * NOTE field strictly and exclusively contains the first date saved on their file.
 */
export function buildCustomerVcard(customer: Customer): {
  vcfContent: string;
  fileName: string;
  firstSavedLabel: string;
} {
  const fullName = (customer.name || 'Krueger Client').trim();
  const { first, last } = splitFullName(fullName);
  const firstSavedLabel = formatCustomerFirstSavedDate(customer.createdAt);

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVcardText(last)};${escapeVcardText(first)};;;`,
    `FN:${escapeVcardText(fullName)}`,
    'ORG:Krueger Painting Client',
  ];

  if (customer.phone && customer.phone.trim()) {
    lines.push(`TEL;TYPE=CELL,VOICE:${customer.phone.trim()}`);
  }

  if (customer.email && customer.email.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET:${customer.email.trim()}`);
  }

  const adr = parseStructuredUsAddress(customer.address);
  if (adr.street || adr.city || adr.state || adr.zip) {
    lines.push(
      `ADR;TYPE=HOME:;;${escapeVcardText(adr.street)};${escapeVcardText(adr.city)};${escapeVcardText(
        adr.state
      )};${escapeVcardText(adr.zip)};${escapeVcardText(adr.country)}`
    );
  }

  // Strictly and exclusively the first saved date on file (no scope, rooms, or pricing)
  lines.push(`NOTE:First saved: ${firstSavedLabel}`);
  lines.push('END:VCARD');

  const safeSlug = fullName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Client';
  return {
    vcfContent: lines.join('\r\n') + '\r\n',
    fileName: `${safeSlug}_Contact.vcf`,
    firstSavedLabel,
  };
}

/**
 * Triggers downloading/opening a customer's vCard (.vcf) so iOS/Android opens the native Contacts import.
 */
export function exportCustomerVcardToContacts(customer: Customer): {
  fileName: string;
  firstSavedLabel: string;
} {
  const { vcfContent, fileName, firstSavedLabel } = buildCustomerVcard(customer);
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { fileName, firstSavedLabel };
}

/**
 * Generates Joshua Krueger — Krueger Painting's official vCard 3.0 (.vcf).
 */
export function buildOwnerBusinessVcard(): { vcfContent: string; fileName: string } {
  const c = KRUEGER_BUSINESS_CARD;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${c.lastName};${c.firstName};;;`,
    `FN:${c.displayName}`,
    `ORG:${c.company}`,
    `TITLE:${c.title}`,
    `TEL;TYPE=CELL,VOICE,PREF:${c.phoneE164}`,
    `EMAIL;TYPE=PREF,INTERNET:${c.email}`,
    `URL:${c.websiteUrl}`,
    `ADR;TYPE=WORK:;;${c.street};${c.city};${c.state};${c.zip};${c.country}`,
    'END:VCARD',
  ];

  return {
    vcfContent: lines.join('\r\n') + '\r\n',
    fileName: 'Joshua_Krueger_Krueger_Painting.vcf',
  };
}

/**
 * Renders a sharp, high-DPI black-and-yellow Krueger Painting digital business card PNG
 * with embedded vector-drawn QR code linking to https://kruegerpaintingwi.com.
 */
export async function generateBusinessCardImageBlob(): Promise<{
  blob: Blob;
  dataUrl: string;
  fileName: string;
}> {
  const width = 1050;
  const height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to initialize business card canvas');

  const c = KRUEGER_BUSINESS_CARD;

  // Base dark matte card background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, width, height);

  // Subtle dark geometric gradient sheen
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#18181b');
  grad.addColorStop(0.6, '#111111');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Left & top Krueger Yellow accent stripes (#f1c40f)
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(0, 0, 18, height);
  ctx.fillRect(0, 0, width, 8);

  // Subtle inner frame border
  ctx.strokeStyle = 'rgba(241, 196, 15, 0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 24, width - 56, height - 48);

  // Left Column: Brand & Contact Info
  const leftX = 72;

  ctx.fillStyle = '#f1c40f';
  ctx.font = '900 50px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillText('KRUEGER PAINTING', leftX, 128);

  // Crisp gold divider rule
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(leftX, 148, 120, 5);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillText(c.owner, leftX, 206);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillText('Precision & Quality  •  Interior & Exterior Painting', leftX, 242);

  // Contact details block
  const detailRows = [
    { label: 'PHONE', val: c.phoneDisplay },
    { label: 'EMAIL', val: c.email },
    { label: 'WEB', val: c.websiteDisplay },
    { label: 'ADDRESS', val: c.addressLine },
  ];

  let rowY = 326;
  detailRows.forEach((row) => {
    ctx.fillStyle = '#f1c40f';
    ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(row.label, leftX, rowY);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(row.val, leftX + 108, rowY);
    rowY += 56;
  });

  // Right Column: Crisp White QR Card linking to https://kruegerpaintingwi.com
  const qrCardSize = 276;
  const qrCardX = width - qrCardSize - 68;
  const qrCardY = 128;

  // Rounded white background plate
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 18);
  ctx.fill();

  // Draw sharp vector-exact QR modules
  const qr = getQrMatrix(c.websiteUrl);
  const quietZone = 22;
  const drawArea = qrCardSize - quietZone * 2;
  const cellSize = drawArea / qr.size;

  ctx.fillStyle = '#111111';
  for (let r = 0; r < qr.size; r++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.isDark(r, col)) {
        const x = qrCardX + quietZone + col * cellSize;
        const y = qrCardY + quietZone + r * cellSize;
        ctx.fillRect(x, y, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
  }

  // QR Caption below plate
  ctx.fillStyle = '#f1c40f';
  ctx.font = '800 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO VISIT WEBSITE', qrCardX + qrCardSize / 2, qrCardY + qrCardSize + 36);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillText('or save contact', qrCardX + qrCardSize / 2, qrCardY + qrCardSize + 62);
  ctx.textAlign = 'left';

  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to export business card PNG'));
    }, 'image/png', 1.0);
  });

  return {
    blob,
    dataUrl,
    fileName: 'Krueger_Painting_Business_Card.png',
  };
}

/**
 * Shares Joshua Krueger's digital business card image or .vcf contact card
 * using the device's native share sheet (`navigator.share`), with clean download fallback.
 */
export async function shareOwnerBusinessCard(mode: 'IMAGE' | 'VCARD'): Promise<'SHARED' | 'DOWNLOADED'> {
  const c = KRUEGER_BUSINESS_CARD;
  const shareTitle = c.displayName;
  const shareText = `${c.displayName}\nPhone: ${c.phoneDisplay}\nEmail: ${c.email}\nWeb: ${c.websiteUrl}\nAddress: ${c.addressLine}`;

  if (mode === 'IMAGE') {
    const { blob, fileName } = await generateBusinessCardImageBlob();
    const imgFile = new File([blob], fileName, { type: 'image/png' });

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [imgFile] })) {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            files: [imgFile],
          });
          return 'SHARED';
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'SHARED';
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'DOWNLOADED';
  }

  // VCARD mode
  const { vcfContent, fileName } = buildOwnerBusinessVcard();
  const vcfBlob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
  const vcfFile = new File([vcfBlob], fileName, { type: 'text/vcard' });

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [vcfFile] })) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [vcfFile],
        });
        return 'SHARED';
      }
      // If browser supports text share but not .vcf file share, share contact details + website
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: c.websiteUrl,
      });
      return 'SHARED';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'SHARED';
    }
  }

  const url = URL.createObjectURL(vcfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'DOWNLOADED';
}
