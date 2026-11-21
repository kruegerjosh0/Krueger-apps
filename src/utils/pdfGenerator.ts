import { jsPDF } from 'jspdf';
import { Customer, JobProject, PrintSettings, SystemConstants } from '../types';
import { resolvePrepOptionScopeText } from './projectHelpers';
import { KRUEGER_BUSINESS_CARD, getQrMatrix } from './businessCard';

export interface GeneratedPdfResult {
  doc: jsPDF;
  blob: Blob;
  blobUrl: string;
  dataUrl: string;
  fileName: string;
  grossTotal: number;
  balanceDue: number;
}

// Krueger Painting official logo SVG
const KRUEGER_OFFICIAL_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300"><circle cx="150" cy="150" r="142" fill="#3b2b1d"/><circle cx="150" cy="150" r="136" fill="#f4c430"/><circle cx="150" cy="150" r="128" fill="none" stroke="#3b2b1d" stroke-width="3"/><text x="150" y="125" font-family="'Impact', 'Arial Black', sans-serif" font-size="25" font-weight="900" fill="#231709" text-anchor="middle" letter-spacing="1">KRUEGER PAINTING</text><text x="150" y="152" font-family="'Arial', sans-serif" font-size="10" font-weight="800" fill="#231709" text-anchor="middle" letter-spacing="0.5">INTERIOR &amp; EXTERIOR PAINTING</text><text x="150" y="166" font-family="'Arial', sans-serif" font-size="10" font-weight="800" fill="#231709" text-anchor="middle" letter-spacing="0.5">PRESSURE WASHING &amp; MORE</text><text x="150" y="188" font-family="'Arial', sans-serif" font-size="9" font-weight="800" fill="#231709" text-anchor="middle" letter-spacing="0.8">CALL OR TEXT</text><text x="150" y="212" font-family="'Impact', 'Arial Black', sans-serif" font-size="22" font-weight="900" fill="#231709" text-anchor="middle">(262) 443-1199</text><g transform="translate(48,138) rotate(-22)"><path d="M0,35 L16,35 L12,12 L4,12 Z" fill="#b0c4de"/><path d="M2,12 L14,12 L11,0 L5,0 Z" fill="#231709"/><path d="M-2,35 Q8,52 18,35 Z" fill="#231709"/></g><g transform="translate(236,138) rotate(22)"><path d="M-16,35 L0,35 L-4,12 L-12,12 Z" fill="#b0c4de"/><path d="M-14,12 L-2,12 L-5,0 L-11,0 Z" fill="#231709"/><path d="M-18,35 Q-8,52 2,35 Z" fill="#231709"/></g></svg>`;

let cachedLogoPng: string | null = null;
const circularLogoCache = new Map<string, string>();

/**
 * Renders any image/SVG data URL onto a transparent RGBA canvas clipped strictly to a circle,
 * completely eliminating any square white bounding box or white padding against dark PDF headers.
 */
async function clipImageToTransparentCirclePng(srcUrl: string, size = 600): Promise<string> {
  const cached = circularLogoCache.get(srcUrl);
  if (cached) return cached;

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }
        // Strictly transparent canvas background
        ctx.clearRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Circular clipping mask (border-radius: 50% equivalent)
        const radius = size / 2 - 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Center-crop to square (cover) so circular logos fill the circle with zero white corners
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        ctx.restore();

        const pngDataUrl = canvas.toDataURL('image/png');
        circularLogoCache.set(srcUrl, pngDataUrl);
        resolve(pngDataUrl);
      };
      img.onerror = () => resolve('');
      img.src = srcUrl;
    } catch {
      resolve('');
    }
  });
}

async function getHighResLogoPng(): Promise<string> {
  if (cachedLogoPng) return cachedLogoPng;

  return new Promise((resolve) => {
    try {
      const blob = new Blob([KRUEGER_OFFICIAL_LOGO_SVG], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const size = 600;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, size, size);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, (142 / 150) * (size / 2), 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 0, 0, size, size);
          ctx.restore();
          cachedLogoPng = canvas.toDataURL('image/png');
          resolve(cachedLogoPng);
        } else {
          resolve('');
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
      img.src = url;
    } catch {
      resolve('');
    }
  });
}

/**
 * Resolves either a custom uploaded logo (clipped into a transparent circular PNG)
 * or the official high-res circular Krueger Painting seal PNG.
 */
async function resolveCircularTransparentLogoPng(customLogoBase64?: string): Promise<string> {
  let rawLogo = customLogoBase64;
  if (!rawLogo && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('KMaster_Logo');
      if (stored) {
        try {
          rawLogo = JSON.parse(stored);
        } catch {
          rawLogo = stored;
        }
      }
    } catch {
      // ignore
    }
  }

  if (rawLogo) {
    const clipped = await clipImageToTransparentCirclePng(rawLogo, 600);
    if (clipped) return clipped;
  }

  return getHighResLogoPng();
}

export const KRUEGER_PHONE = '(262) 443-1199';
export const KRUEGER_EMAIL = 'krueptg@gmail.com';
export const KRUEGER_WEBSITE = 'kruegerpaintingwi.com';

/**
 * Draws the official Krueger Painting #111111 black-and-yellow header across all generated PDFs
 * (Estimates, Final Bills, Master Records, and Blank Letterheads) with a transparent circular logo
 * and visible phone, email, website (kruegerpaintingwi.com), and street address.
 */
async function drawBrandedBlackHeader(
  doc: jsPDF,
  settings: PrintSettings,
  options: {
    pageWidth: number;
    margin: number;
    docBadge?: string;
    customLogoBase64?: string;
  }
): Promise<number> {
  const { pageWidth, margin, docBadge, customLogoBase64 } = options;
  const rightMargin = pageWidth - margin;
  const headerHeight = 104;

  // Top gold accent edge
  doc.setFillColor(241, 196, 15); // #f1c40f
  doc.rect(0, 0, pageWidth, 4, 'F');

  // Solid #111111 black header background
  doc.setFillColor(17, 17, 17); // #111111
  doc.rect(0, 4, pageWidth, headerHeight - 4, 'F');

  // Bottom bold gold accent stripe
  doc.setFillColor(241, 196, 15); // #f1c40f
  doc.rect(0, headerHeight, pageWidth, 5, 'F');

  // Circular transparent PNG logo (zero white bounding box)
  const logoPng = await resolveCircularTransparentLogoPng(customLogoBase64);
  const logoDiameter = 74;
  let textStartX = margin;

  if (logoPng) {
    try {
      const logoY = 4 + Math.round((headerHeight - 4 - logoDiameter) / 2);
      doc.addImage(logoPng, 'PNG', margin, logoY, logoDiameter, logoDiameter);
      textStartX = margin + logoDiameter + 14;
    } catch {
      textStartX = margin;
    }
  }

  // Brand Name & Motto (Left/Center-Left)
  const rawAddr = (settings.hdr || 'N630 Moraine Dr., Campbellsport, WI 53010').split('|')[0].trim();
  const streetAddress = rawAddr || 'N630 Moraine Dr., Campbellsport, WI 53010';
  const mottoText = (settings.motto || 'Precision & Quality').trim();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(241, 196, 15); // #f1c40f
  doc.text('KRUEGER PAINTING', textStartX, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(235, 235, 235);
  doc.text('INTERIOR & EXTERIOR PAINTING  •  PRESSURE WASHING', textStartX, 56);

  if (mottoText) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 185, 185);
    doc.text(`"${mottoText}"`, textStartX, 70);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(175, 175, 175);
  doc.text(streetAddress, textStartX, 84);

  // Right-Aligned Document Badge (if Estimate/Bill) + Contact Details with Website URL
  let contactStartY = 38;
  if (docBadge) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const badgeTextW = doc.getTextWidth(docBadge);
    const pillW = Math.max(78, badgeTextW + 18);
    const pillH = 18;
    const pillX = rightMargin - pillW;
    const pillY = 14;

    doc.setFillColor(241, 196, 15);
    doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
    doc.setTextColor(17, 17, 17);
    doc.text(docBadge, pillX + pillW / 2, pillY + 12.5, { align: 'center' });
    contactStartY = 48;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(241, 196, 15);
  doc.text(KRUEGER_PHONE, rightMargin, contactStartY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(255, 255, 255);
  doc.text(KRUEGER_EMAIL, rightMargin, contactStartY + 14, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(241, 196, 15);
  doc.text(KRUEGER_WEBSITE, rightMargin, contactStartY + 28, { align: 'right' });

  return headerHeight + 24;
}

/**
 * Generates a 100% Vector PDF using native jsPDF text & geometric instructions.
 * Text is razor-sharp at any zoom level, selectable, searchable, and crystal-clear
 * in Foxit PDF Editor, Adobe Acrobat, and Apple Preview (zero photocopy/raster blurriness).
 */
export async function generateEstimateOrBillPdf(
  customer: Customer,
  job: JobProject,
  type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD',
  settings: PrintSettings,
  constants: SystemConstants,
  customLogoBase64?: string
): Promise<GeneratedPdfResult> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter', // 612 x 792 pt
  });

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 532 pt
  const rightMargin = pageWidth - margin;

  // Financial & paint calculations
  const repairRate = Math.round(job.repairRate || constants.repairRate || 75);
  let laborOnly = 0;
  let computedPaintGals = 0;
  let totalSqft = 0;

  (job.rooms || []).forEach((r) => {
    const roomPrice = Math.round(Number(r.r) || 0);
    laborOnly += roomPrice;

    if (r.og && parseFloat(r.og) > 0) {
      computedPaintGals += parseFloat(r.og);
    } else {
      const dimMatch = (r.n || '').toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
      if (dimMatch) {
        const sqft = parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
        totalSqft += sqft;
      }
    }
  });

  if (totalSqft > 0 && computedPaintGals === 0) {
    computedPaintGals = Math.ceil((totalSqft * 2) / (constants.spreadRate || 350));
  }

  let repHrs = 0;
  (job.repairs || []).forEach((rep) => {
    repHrs += parseFloat(String(rep.h)) || 0;
  });
  const repairLaborTotal = Math.round(repHrs * repairRate);

  const dVal = parseFloat(String(job.disc)) || 0;
  const dType = job.discType || 'PCT';
  const dLabel = job.discLabel || 'Discount';
  const dAmt = dType === 'PCT' ? Math.round(laborOnly * (dVal / 100)) : Math.round(dVal);
  const finalLabor = laborOnly - dAmt;

  const perGalPrice = Math.round(constants.paintCostPerGal || 65);
  let matCost = 0;
  if (!job.matsIncluded) {
    if (job.matVal && Number(job.matVal) > 0) {
      matCost = Math.round(Number(job.matVal));
    } else if (computedPaintGals > 0) {
      matCost = Math.round(computedPaintGals * perGalPrice);
    }
  }

  const sundriesCost = job.matsIncluded ? 0 : Math.round(parseFloat(String(job.sunVal)) || 0);
  const grossTotal = Math.round(finalLabor + repairLaborTotal + matCost + sundriesCost);

  let totalPaid = 0;
  if (job.payments && job.payments.length > 0) {
    job.payments.forEach((p) => {
      totalPaid += Math.round(Number(p.amt) || 0);
    });
  } else if (job.depo > 0) {
    totalPaid = Math.round(job.depo);
  }
  const balanceDue = Math.max(0, grossTotal - totalPaid);

  const docTypeHeader =
    type === 'BILL' ? 'FINAL BILL' : type === 'MASTER RECORD' ? 'MASTER RECORD' : 'ESTIMATE';

  // 1. UNIFIED BLACK & YELLOW BRAND HEADER (#111111 + Transparent Circle Logo + Website URL)
  let y = await drawBrandedBlackHeader(doc, settings, {
    pageWidth,
    margin,
    docBadge: docTypeHeader,
    customLogoBase64,
  });

  // Helper to manage page breaks cleanly
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 50) {
      doc.addPage();
      y = 40;
    }
  };

  // Section Header with Gold Blotch (Authentic Krueger contractor style: #f1c40f)
  const drawSectionHeader = (title: string) => {
    checkPageBreak(30);
    // Gold blotch (crisp 4pt x 12pt rectangle)
    doc.setFillColor(241, 196, 15);
    doc.rect(margin, y - 10, 4, 12, 'F');

    // Section title text - clean integer 10pt bold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(title, margin + 10, y);
    y += 16;
  };


  // 3. METADATA SECTION: Customer on Left, Date on Right
  checkPageBreak(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('CUSTOMER:', margin, y);
  doc.text('DATE:', rightMargin, y, { align: 'right' });

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  const custNameLines = doc.splitTextToSize(customer.name || 'Valued Client', 340);
  doc.text(custNameLines, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(job.date || new Date().toLocaleDateString(), rightMargin, y, { align: 'right' });

  y += custNameLines.length * 13;
  if (customer.address) {
    const addrLines = doc.splitTextToSize(customer.address, 340);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 13;
  }
  if (customer.phone) {
    doc.text(customer.phone, margin, y);
    y += 16;
  } else {
    y += 6;
  }

  // 4. SECTION: PREP WORK (Only rendered when job-level prep notes are specified)
  const rawJobPrep = (job.prepScope || '').trim();
  if (rawJobPrep) {
    drawSectionHeader('PREP WORK');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);

    const prepRawLines = rawJobPrep.split('\n');
    const bulletIndent = 12;
    const lineHeight = 13.5;

    prepRawLines.forEach((rawLine) => {
      const t = rawLine.trim();
      if (!t) {
        y += 5;
        return;
      }

      const isBullet = /^[-•*]\s+/.test(t);
      if (isBullet) {
        const bodyText = t.replace(/^[-•*]\s+/, '');
        const wrapped = doc.splitTextToSize(bodyText, contentWidth - bulletIndent);
        checkPageBreak(wrapped.length * lineHeight + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 30, 30);
        doc.text('•', margin + 2, y);
        wrapped.forEach((wLine: string, wIdx: number) => {
          doc.text(wLine, margin + bulletIndent, y + wIdx * lineHeight);
        });
        y += wrapped.length * lineHeight + 3;
      } else {
        const wrapped = doc.splitTextToSize(t, contentWidth);
        checkPageBreak(wrapped.length * lineHeight + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 30, 30);
        wrapped.forEach((wLine: string, wIdx: number) => {
          doc.text(wLine, margin, y + wIdx * lineHeight);
        });
        y += wrapped.length * lineHeight + 3;
      }
    });

    y += 8;
  }

  // Reserved width for price column on the right (strictly prevents any text overlap)
  const priceColWidth = 85;
  const itemTextWidth = contentWidth - priceColWidth; // e.g. 532 - 85 = 447 pt

  // 5. SECTION: SCOPE OF WORK (2 FULL COATS)
  drawSectionHeader('SCOPE OF WORK (2 FULL COATS)');

  if (job.rooms && job.rooms.length > 0) {
    job.rooms.forEach((r) => {
      const roomName = (r.n || 'Area').trim();
      const roomPrice = Math.round(Number(r.r) || 0);
      const showLinePaint = r.sp !== false;

      let currentRoomGals = 0;
      if (r.og && parseFloat(r.og) > 0) {
        currentRoomGals = parseFloat(r.og);
      } else {
        const dimMatch = roomName.toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/);
        if (dimMatch) {
          const sqft = parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
          currentRoomGals = Math.ceil((sqft * 2) / (constants.spreadRate || 350));
        }
      }

      // Build clean paint details: "Amount of paint: 2 Gallons - Emerald - (Satin) - Color: Repose Gray"
      let paintDetail = '';
      if (
        showLinePaint &&
        (currentRoomGals > 0 || r.prod?.trim() || r.sheen?.trim() || r.color?.trim())
      ) {
        const paintParts: string[] = [];
        if (currentRoomGals > 0) {
          paintParts.push(
            `Amount of paint: ${currentRoomGals} ${currentRoomGals === 1 ? 'Gallon' : 'Gallons'}`
          );
        }
        if (r.prod && r.prod.trim()) paintParts.push(r.prod.trim());
        if (r.sheen && r.sheen.trim()) paintParts.push(`(${r.sheen.trim()})`);
        if (r.color && r.color.trim()) paintParts.push(`Color: ${r.color.trim()}`);
        paintDetail = paintParts.join(' - ');
      }

      // Room-specific prep & setup checklist items (expanded to client-ready estimate phrasing)
      const roomPrepList = Array.isArray(r.prep)
        ? r.prep.map((p) => resolvePrepOptionScopeText(p)).filter(Boolean)
        : [];
      const roomPrepDetail =
        roomPrepList.length > 0 ? `Prep & Setup: ${roomPrepList.join(' • ')}` : '';

      // Room name in crisp bold helvetica (no dash prefix!)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const nameLines = doc.splitTextToSize(roomName, itemTextWidth);

      // Paint lines in light gray tone
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const paintLines = paintDetail
        ? doc.splitTextToSize(paintDetail, itemTextWidth - 10)
        : [];

      // Room prep lines in crisp charcoal tone
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const roomPrepLines = roomPrepDetail
        ? doc.splitTextToSize(roomPrepDetail, itemTextWidth - 10)
        : [];

      const neededHeight =
        nameLines.length * 14 + paintLines.length * 12.5 + roomPrepLines.length * 12.5 + 14;
      checkPageBreak(neededHeight);

      const startY = y;

      // 1. Render Room Name (Bold black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      nameLines.forEach((lText: string, lIdx: number) => {
        doc.text(lText, margin, startY + lIdx * 14);
      });

      let detailY = startY + nameLines.length * 14;

      // 2. Render paint line underneath in light gray tone
      if (paintLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(125, 125, 125);
        paintLines.forEach((pText: string, pIdx: number) => {
          doc.text(pText, margin + 10, detailY + pIdx * 12.5);
        });
        detailY += paintLines.length * 12.5;
      }

      // 3. Render room prep & setup items underneath in crisp charcoal
      if (roomPrepLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(65, 65, 65);
        roomPrepLines.forEach((rpText: string, rpIdx: number) => {
          doc.text(rpText, margin + 10, detailY + rpIdx * 12.5);
        });
        detailY += roomPrepLines.length * 12.5;
      }

      // 4. Render Price on first line on Right (bold black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`$${roomPrice}`, rightMargin, startY, { align: 'right' });

      // Subtle dashed separator line below item
      const blockBottomY = detailY;
      doc.setDrawColor(235, 235, 235);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(margin, blockBottomY + 2, rightMargin, blockBottomY + 2);
      doc.setLineDashPattern([], 0);

      y = blockBottomY + 9;
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text('Scope of work per client consultation.', margin, y);
    y += 18;
  }

  // General scope notes if present
  if (job.scope && job.scope.trim()) {
    checkPageBreak(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const scopeLines = doc.splitTextToSize(job.scope.trim(), contentWidth);
    doc.text(scopeLines, margin, y + 2);
    y += scopeLines.length * 14 + 10;
  }

  // 6. SECTION: REPAIRS (if present)
  if (job.repairs && job.repairs.length > 0) {
    drawSectionHeader('REPAIRS');
    job.repairs.forEach((rep) => {
      const h = parseFloat(String(rep.h)) || 0;
      const repCost = Math.round(h * repairRate);
      const repTitle = `${rep.d || 'Surface repair'} (${h} hrs)`;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const repLines = doc.splitTextToSize(repTitle, itemTextWidth);

      const neededHeight = repLines.length * 14 + 8;
      checkPageBreak(neededHeight);

      const startY = y;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      repLines.forEach((lText: string, lIdx: number) => {
        doc.text(lText, margin, startY + lIdx * 14);
      });

      doc.setFont('helvetica', 'bold');
      doc.text(`$${repCost}`, rightMargin, startY, { align: 'right' });

      const blockBottomY = startY + repLines.length * 14;
      doc.setDrawColor(235, 235, 235);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(margin, blockBottomY + 2, rightMargin, blockBottomY + 2);
      doc.setLineDashPattern([], 0);

      y = blockBottomY + 8;
    });
    y += 4;
  }

  // 7. SECTION: ITEMIZATION
  drawSectionHeader('ITEMIZATION');
  checkPageBreak(80);

  const drawItemizationRow = (label: string, value: string, isColorRed = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const labelLines = doc.splitTextToSize(label, itemTextWidth);

    const neededHeight = labelLines.length * 14 + 6;
    checkPageBreak(neededHeight);

    const startY = y;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    labelLines.forEach((lText: string, lIdx: number) => {
      doc.text(lText, margin, startY + lIdx * 14);
    });

    doc.setFont('helvetica', 'bold');
    if (isColorRed) {
      doc.setTextColor(192, 57, 43); // Red
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.text(value, rightMargin, startY, { align: 'right' });

    const blockBottomY = startY + labelLines.length * 14;
    doc.setDrawColor(235, 235, 235);
    doc.line(margin, blockBottomY + 2, rightMargin, blockBottomY + 2);
    y = blockBottomY + 6;
  };

  // Labor line
  if (type === 'BILL' || job.showLaborTotal) {
    drawItemizationRow('Labor & Prep', `$${laborOnly}`);
  } else {
    drawItemizationRow('Labor & Prep', '');
  }

  // Discount
  if (dAmt > 0) {
    const descStr = dType === 'PCT' ? `${dLabel} (${dVal}%)` : dLabel;
    drawItemizationRow(descStr, `-$${dAmt}`, true);
  }

  // Repairs total
  if (job.repairs && job.repairs.length > 0) {
    drawItemizationRow(`Repair Labor (${repHrs} hrs @ $${repairRate}/hr)`, `$${repairLaborTotal}`);
  }

  // Coatings & Sundries
  if (job.matsIncluded) {
    drawItemizationRow(
      `Coatings & Materials ${computedPaintGals > 0 ? `(${computedPaintGals} Gal Est.)` : ''}`,
      'INCLUDED'
    );
  } else {
    drawItemizationRow(
      `Coatings (${computedPaintGals} Gal Est. @ $${perGalPrice}/gal)`,
      `$${matCost}`
    );
    drawItemizationRow('Sundries', `$${sundriesCost}`);
  }

  // Bill Gross and payments
  if (type === 'BILL') {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(35, 23, 9);
    doc.text('Gross Total', margin, y);
    doc.text(`$${grossTotal}`, rightMargin, y, { align: 'right' });
    y += 18;

    if (job.payments && job.payments.length > 0) {
      job.payments.forEach((p) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Payment (${p.date}):`, margin, y);
        doc.text(`-$${Math.round(Number(p.amt) || 0)}`, rightMargin, y, { align: 'right' });
        y += 15;
      });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`TOTAL PAID: -$${totalPaid}`, rightMargin, y, { align: 'right' });
    y += 18;
  }

  // 8. PROJECT SUMMARY BANNER (Gold #f1c40f with dark border #3b2b1d)
  checkPageBreak(50);
  y += 6;
  const isBill = type === 'BILL';
  const labelTitle = isBill ? 'BALANCE DUE:' : 'ESTIMATED TOTAL:';
  const labelVal = isBill ? `$${balanceDue}` : `$${grossTotal}`;

  doc.setFillColor(241, 196, 15); // #f1c40f
  doc.rect(margin, y, contentWidth, 26, 'F');
  doc.setDrawColor(59, 43, 29); // #3b2b1d
  doc.setLineWidth(1.5);
  doc.rect(margin, y, contentWidth, 26, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('PROJECT SUMMARY', margin + 12, y + 17);

  doc.setFontSize(13);
  doc.text(`${labelTitle} ${labelVal}`, rightMargin - 12, y + 18, { align: 'right' });
  y += 38;

  // 9. CLIENT AUTHORIZATION & SIGNATURE BLOCK
  checkPageBreak(120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(
    'By signing below or authorizing electronically, the client accepts the itemized scope of work, pricing, and terms outlined in this document.',
    margin,
    y
  );
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('CLIENT AUTHORIZATION & SIGNATURE:', margin, y);
  y += 6;

  if (job.clientSig && job.clientSig.length > 50) {
    try {
      doc.addImage(job.clientSig, 'PNG', margin, y, 160, 44);
      y += 48;
    } catch {
      doc.setDrawColor(170, 170, 170);
      doc.rect(margin, y, 220, 44, 'S');
      y += 48;
    }
  } else {
    // Blank signature box
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(1);
    doc.rect(margin, y, 220, 44, 'S');
    y += 50;

    // Remote approval dashed box
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([3, 3], 0);
    doc.rect(margin, y, contentWidth, 34, 'S');
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text('REMOTE APPROVAL INSTRUCTIONS:', margin + 8, y + 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(
      'To approve this estimate electronically, please reply to the email or text message containing this document stating:',
      margin + 8,
      y + 20
    );

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(30, 30, 30);
    doc.text(
      `"I, ${customer.name}, accept this estimate and authorize Krueger Painting to proceed."`,
      margin + 8,
      y + 28
    );
    y += 42;
  }

  // 10. TWO-COLUMN LEGAL & WARRANTY POLICIES + SUBTLE ESTIMATE FOOTER CARD
  const colWidth = (contentWidth - 16) / 2;
  const col1X = margin;
  const col2X = margin + colWidth + 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const t1Lines = doc.splitTextToSize(
    settings.t1 ||
      'Krueger Painting uses high-quality coatings and prep work for lasting finishes. Standard projects include full two-coat application.',
    colWidth
  );
  const t2Lines = doc.splitTextToSize(
    settings.t2 ||
      'A 50% deposit is requested on the first day to initiate work. The remaining balance is due upon physical completion.',
    colWidth
  );
  const t3Lines = doc.splitTextToSize(
    settings.t3 ||
      'Final color selections must be provided by the homeowner before the start date. Assistance available upon request.',
    colWidth
  );
  const t4Lines = doc.splitTextToSize(
    settings.t4 ||
      'Warranty excludes damage caused by structural settling or moisture issues. Unforeseen issues will be discussed immediately.',
    colWidth
  );

  const row1Height = Math.max(t1Lines.length, t2Lines.length) * 8 + 12;
  const row2Height = Math.max(t3Lines.length, t4Lines.length) * 8 + 10;
  const legalBlockHeight = 10 + row1Height + row2Height;
  const includeEstimateFooterCard = type === 'ESTIMATE';
  const reservedFooterHeight = includeEstimateFooterCard ? 66 : 16;

  // Keep legal policies and subtle estimate footer card together on the final page (never create an orphan card page)
  if (y + legalBlockHeight + reservedFooterHeight > pageHeight - 14) {
    doc.addPage();
    y = 40;
  }

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(1);
  doc.line(margin, y, rightMargin, y);
  y += 10;

  // Row 1: Term 1 & 2
  const row1Y = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text('1. QUALITY & MATERIAL STANDARDS:', col1X, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text(t1Lines, col1X, row1Y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('2. PAYMENT POLICY:', col2X, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text(t2Lines, col2X, row1Y + 8);

  // Row 2: Term 3 & 4
  const row2Y = row1Y + row1Height;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('3. COLOR SELECTION POLICY:', col1X, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text(t3Lines, col1X, row2Y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('4. EXCLUSIONS & WARRANTY TERMS:', col2X, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text(t4Lines, col2X, row2Y + 8);

  // 11. SUBTLE EMBEDDED HORIZONTAL BUSINESS CARD FOOTER STRIP (Estimate PDFs Only — Existing Final Page)
  if (includeEstimateFooterCard) {
    const afterLegalY = row2Y + row2Height;
    const cardHeight = 52;
    const bottomPadding = 18;
    const pinnedBottomY = pageHeight - bottomPadding - cardHeight;
    // Pin cleanly at the very bottom footer of the existing final page, or sit directly below legal text if tight
    const cardY = Math.min(Math.max(afterLegalY + 8, pinnedBottomY), pageHeight - cardHeight - 10);

    // Dark sleek horizontal strip (#111111) with gold accent stripe (#f1c40f)
    doc.setFillColor(17, 17, 17);
    doc.roundedRect(margin, cardY, contentWidth, cardHeight, 4, 4, 'F');

    // Subtle gold left bar & hairline top accent
    doc.setFillColor(241, 196, 15);
    doc.rect(margin, cardY, 4, cardHeight, 'F');
    doc.setDrawColor(241, 196, 15);
    doc.setLineWidth(0.9);
    doc.line(margin + 4, cardY + 0.5, rightMargin - 2, cardY + 0.5);

    const textLeftX = margin + 14;
    const biz = KRUEGER_BUSINESS_CARD;

    // Row 1: Company Name + Owner
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(241, 196, 15);
    const companyText = biz.company.toUpperCase();
    doc.text(companyText, textLeftX, cardY + 16);

    const companyWidth = doc.getTextWidth(companyText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 128);
    doc.text('|', textLeftX + companyWidth + 6, cardY + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(biz.owner, textLeftX + companyWidth + 14, cardY + 16);

    // Row 2: Phone • Email • Website
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(240, 244, 248);
    doc.text(
      `${biz.phoneDisplay}   •   ${biz.email}   •   ${biz.websiteDisplay}`,
      textLeftX,
      cardY + 30
    );

    // Row 3: Mailing Address
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(186, 194, 204);
    doc.text(biz.addressLine, textLeftX, cardY + 42);

    // Right Side: Crisp Vector QR Code linking to https://kruegerpaintingwi.com
    const qrBoxSize = 40;
    const qrBoxX = rightMargin - qrBoxSize - 6;
    const qrBoxY = cardY + (cardHeight - qrBoxSize) / 2;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 2.5, 2.5, 'F');

    const qr = getQrMatrix(biz.websiteUrl);
    const quietPad = 3;
    const qrDrawSize = qrBoxSize - quietPad * 2;
    const cell = qrDrawSize / qr.size;

    doc.setFillColor(17, 17, 17);
    for (let r = 0; r < qr.size; r++) {
      for (let cIdx = 0; cIdx < qr.size; cIdx++) {
        if (qr.isDark(r, cIdx)) {
          doc.rect(qrBoxX + quietPad + cIdx * cell, qrBoxY + quietPad + r * cell, cell + 0.08, cell + 0.08, 'F');
        }
      }
    }

    // Make QR clickable in digital PDF viewers
    doc.link(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, { url: biz.websiteUrl });

    // Subtle right-aligned scan caption beside the QR code
    const captionRightX = qrBoxX - 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(241, 196, 15);
    doc.text('Scan to visit website', captionRightX, cardY + 23, { align: 'right' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(203, 213, 225);
    doc.text('or save contact', captionRightX, cardY + 33, { align: 'right' });
  }

  // Output vector PDF
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUrl = doc.output('dataurlstring');

  const cleanCustName = (customer.name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanTitle = (job.title || type).replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Krueger_${type === 'BILL' ? 'Invoice' : 'Estimate'}_${cleanCustName}_${cleanTitle}.pdf`;

  return {
    doc,
    blob,
    blobUrl,
    dataUrl,
    fileName,
    grossTotal,
    balanceDue,
  };
}

export function downloadPdfFile(result: GeneratedPdfResult) {
  const link = document.createElement('a');
  link.href = result.blobUrl;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Opens a generated PDF directly in a full-screen browser tab/window in one tap.
 * Pass an optional preOpenedWindow (opened synchronously on click before async generation)
 * to bypass mobile/desktop popup blockers cleanly.
 */
export function openPdfDirectly(result: GeneratedPdfResult, preOpenedWindow?: Window | null): boolean {
  try {
    if (preOpenedWindow && !preOpenedWindow.closed) {
      preOpenedWindow.location.href = result.blobUrl;
      return true;
    }
    const win = window.open(result.blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return true;
    const link = document.createElement('a');
    link.href = result.blobUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    downloadPdfFile(result);
    return false;
  }
}

export async function sharePdfFile(result: GeneratedPdfResult, title: string, text: string) {
  const pdfFile = new File([result.blob], result.fileName, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        title,
        text,
        files: [pdfFile],
      });
      return true;
    } catch {
      return false;
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ title, text });
      downloadPdfFile(result);
      return true;
    } catch {
      return false;
    }
  } else {
    downloadPdfFile(result);
    return true;
  }
}

/**
 * Reconstructs a GeneratedPdfResult from a stored base64 data URL for instant viewing
 */
export function dataUrlToPdfResult(
  dataUrl: string,
  fileName: string,
  grossTotal = 0,
  balanceDue = 0
): GeneratedPdfResult {
  let blob: Blob;
  try {
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: 'application/pdf' });
  } catch {
    blob = new Blob([], { type: 'application/pdf' });
  }
  const blobUrl = URL.createObjectURL(blob);
  return {
    doc: null as any,
    blob,
    blobUrl,
    dataUrl,
    fileName,
    grossTotal,
    balanceDue,
  };
}

export interface LetterheadOptions {
  documentTitle?: string;
  dateStr?: string;
  recipientName?: string;
  recipientInfo?: string;
  bodyText?: string;
  showBlankLines?: boolean;
  includeSignatureLine?: boolean;
}

/**
 * Generates an official Krueger Painting Blank / Custom Business Letterhead PDF
 * featuring #111111 black-and-yellow styling, transparent circular logo, and
 * contact info ((262) 443-1199 / krueptg@gmail.com / kruegerpaintingwi.com).
 */
export async function generateBlankLetterheadPdf(
  options: LetterheadOptions,
  settings: PrintSettings,
  customLogoBase64?: string
): Promise<GeneratedPdfResult> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter', // 612 x 792 pt
  });

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const rightMargin = pageWidth - margin;

  // Extract clean street/city address from settings.hdr (strip trailing phone if present)
  const rawAddr = (settings.hdr || 'N630 Moraine Dr., Campbellsport, WI 53010').split('|')[0].trim();
  const streetAddress = rawAddr || 'N630 Moraine Dr., Campbellsport, WI 53010';

  const drawFooter = (pageNum: number, totalPages: number) => {
    const footerHeight = 34;
    const footerTop = pageHeight - footerHeight;

    // Gold accent stripe above footer
    doc.setFillColor(241, 196, 15); // #f1c40f
    doc.rect(0, footerTop - 3, pageWidth, 3, 'F');

    // Signature #111111 black footer band
    doc.setFillColor(17, 17, 17); // #111111
    doc.rect(0, footerTop, pageWidth, footerHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(241, 196, 15);
    doc.text('KRUEGER PAINTING', margin, footerTop + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(225, 225, 225);
    doc.text(
      `${KRUEGER_PHONE}  •  ${KRUEGER_EMAIL}  •  ${KRUEGER_WEBSITE}  •  ${streetAddress}`,
      margin,
      footerTop + 26
    );

    if (totalPages > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(241, 196, 15);
      doc.text(`Page ${pageNum} of ${totalPages}`, rightMargin, footerTop + 15, { align: 'right' });
    }
  };

  // --- PAGE 1 UNIFIED #111111 BLACK & YELLOW EXECUTIVE HEADER ---
  let y = await drawBrandedBlackHeader(doc, settings, {
    pageWidth,
    margin,
    customLogoBase64,
  });
  y += 6;

  const docTitle = (options.documentTitle || '').trim();
  const dateDisplay = (options.dateStr || '').trim();

  // Document Title & Date Row
  if (docTitle || dateDisplay) {
    if (docTitle) {
      // Signature gold accent bar beside document title
      doc.setFillColor(241, 196, 15);
      doc.rect(margin, y - 13, 5, 17, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(18, 19, 24);
      const titleLines = doc.splitTextToSize(docTitle.toUpperCase(), contentWidth - 130);
      doc.text(titleLines, margin + 12, y);

      if (dateDisplay) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(80, 80, 80);
        doc.text(dateDisplay, rightMargin, y, { align: 'right' });
      }
      y += Math.max(titleLines.length * 16, 18) + 8;
    } else if (dateDisplay) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(70, 70, 70);
      doc.text(dateDisplay, rightMargin, y, { align: 'right' });
      y += 20;
    }

    // Subtle divider under title/date
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(1);
    doc.line(margin, y - 4, rightMargin, y - 4);
    y += 14;
  }

  // Optional Recipient Block
  const recipName = (options.recipientName || '').trim();
  const recipInfo = (options.recipientInfo || '').trim();
  if (recipName || recipInfo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 95, 15);
    doc.text('TO:', margin, y);
    y += 14;

    if (recipName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(18, 19, 24);
      const rNameLines = doc.splitTextToSize(recipName, contentWidth);
      doc.text(rNameLines, margin, y);
      y += rNameLines.length * 14;
    }

    if (recipInfo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(55, 55, 55);
      const rInfoLines = doc.splitTextToSize(recipInfo, contentWidth);
      doc.text(rInfoLines, margin, y);
      y += rInfoLines.length * 13.5;
    }
    y += 14;
  }

  const bottomLimit = pageHeight - (options.includeSignatureLine ? 120 : 62);
  const bodyContent = (options.bodyText || '').trim();

  if (bodyContent) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(25, 25, 25);

    const paragraphs = options.bodyText!.split('\n');
    const lineHeight = 15.5;

    paragraphs.forEach((para) => {
      if (!para.trim()) {
        y += 10;
        if (y > pageHeight - 62) {
          doc.addPage();
          // Mini continuation header bar
          doc.setFillColor(18, 19, 24);
          doc.rect(0, 0, pageWidth, 24, 'F');
          doc.setFillColor(241, 196, 15);
          doc.rect(0, 24, pageWidth, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(241, 196, 15);
          doc.text('KRUEGER PAINTING', margin, 15);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(220, 220, 220);
          doc.text(docTitle || 'Official Correspondence', rightMargin, 15, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(25, 25, 25);
          y = 54;
        }
        return;
      }

      const wrappedLines: string[] = doc.splitTextToSize(para, contentWidth);
      wrappedLines.forEach((line) => {
        if (y + lineHeight > pageHeight - 62) {
          doc.addPage();
          doc.setFillColor(18, 19, 24);
          doc.rect(0, 0, pageWidth, 24, 'F');
          doc.setFillColor(241, 196, 15);
          doc.rect(0, 24, pageWidth, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(241, 196, 15);
          doc.text('KRUEGER PAINTING', margin, 15);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(220, 220, 220);
          doc.text(docTitle || 'Official Correspondence', rightMargin, 15, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(25, 25, 25);
          y = 54;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      });
    });
  } else if (options.showBlankLines) {
    // Draw subtle light writing lines for handwritten field notes
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.75);
    let lineY = y + 12;
    while (lineY < bottomLimit) {
      doc.line(margin, lineY, rightMargin, lineY);
      lineY += 26;
    }
  }

  // Optional Signature Block near bottom of last page
  if (options.includeSignatureLine) {
    if (y > pageHeight - 115) {
      doc.addPage();
      y = 60;
    }
    const sigY = Math.max(y + 36, pageHeight - 102);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(1);
    doc.line(margin, sigY, margin + 230, sigY);
    doc.line(rightMargin - 140, sigY, rightMargin, sigY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('KRUEGER PAINTING  •  SIGNATURE', margin, sigY + 13);
    doc.text('DATE', rightMargin - 140, sigY + 13);
  }

  // Apply black-and-yellow branded footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUrl = doc.output('dataurlstring');

  const safeTitle = docTitle
    ? docTitle.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    : 'Blank_Letterhead';
  const fileName = `Krueger_Painting_${safeTitle}.pdf`;

  return {
    doc,
    blob,
    blobUrl,
    dataUrl,
    fileName,
    grossTotal: 0,
    balanceDue: 0,
  };
}

