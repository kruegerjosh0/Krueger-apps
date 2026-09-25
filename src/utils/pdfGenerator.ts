import { jsPDF } from 'jspdf';
import { Customer, JobProject, PrintSettings, SystemConstants } from '../types';

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

async function getHighResLogoPng(): Promise<string> {
  if (cachedLogoPng) return cachedLogoPng;

  return new Promise((resolve) => {
    try {
      const blob = new Blob([KRUEGER_OFFICIAL_LOGO_SVG], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, 600, 600);
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

  let y = 38;

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

  // 1. TOP RIGHT: Document Type (ESTIMATE / BILL / MASTER RECORD)
  const docTypeHeader =
    type === 'BILL' ? 'BILL' : type === 'MASTER RECORD' ? 'MASTER RECORD' : 'ESTIMATE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(docTypeHeader, rightMargin, y, { align: 'right' });

  // 2. TOP CENTER: High-Res Logo Badge, Company Motto & Address
  let logoData = customLogoBase64;
  if (!logoData && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('KMaster_Logo');
      if (stored) {
        try {
          logoData = JSON.parse(stored);
        } catch {
          logoData = stored;
        }
      }
    } catch {
      // ignore
    }
  }

  // If no custom logo, fall back to high-res official Krueger seal
  if (!logoData) {
    logoData = await getHighResLogoPng();
  }

  if (logoData) {
    try {
      const imgProps = doc.getImageProperties(logoData);
      const aspect = imgProps.width / imgProps.height;
      const maxW = 180;
      const maxH = 75;
      let drawW = maxW;
      let drawH = drawW / aspect;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      const logoX = Math.round((pageWidth - drawW) / 2);
      const format = imgProps.fileType === 'JPEG' || imgProps.fileType === 'JPG' ? 'JPEG' : 'PNG';
      doc.addImage(logoData, format, logoX, y - 6, drawW, drawH);
      y += Math.round(drawH) + 6;
    } catch (err) {
      console.warn('Custom logo format error, falling back to standard seal:', err);
      const fallbackSeal = await getHighResLogoPng();
      if (fallbackSeal) {
        const logoSize = 75;
        const logoX = Math.round((pageWidth - logoSize) / 2);
        doc.addImage(fallbackSeal, 'PNG', logoX, y - 6, logoSize, logoSize);
        y += logoSize + 6;
      } else {
        y += 40;
      }
    }
  } else {
    y += 40;
  }

  // Company Tagline / Motto (if set in settings)
  if (settings.motto && settings.motto.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`"${settings.motto.trim()}"`, Math.round(pageWidth / 2), y, { align: 'center' });
    y += 14;
  }

  // Address line directly under logo/motto (crisp 10pt bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const addressText =
    settings.hdr || 'N630 Moraine Dr. Campbellsport, WI 53010 | (262) 443-1199';
  doc.text(addressText, Math.round(pageWidth / 2), y, { align: 'center' });
  y += 20;

  // Optional project title
  if (job.title && job.title.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`PROJECT: ${job.title.toUpperCase()}`, margin, y);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y + 4, rightMargin, y + 4);
    y += 18;
  }

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

  // 4. SECTION: PREP WORK
  drawSectionHeader('PREP WORK');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  const prepText =
    job.prepScope?.trim() ||
    'Pressure wash entire house, deck spindles/handrails, deck floor, deck steps/risers to remove any failed stain/pain, kill any mildew and remove all additional debris\nScrape and sand all areas necessary and caulk where necessary\nApply one coat of exterior primer to any bare wood';

  const prepLines = doc.splitTextToSize(prepText, contentWidth);
  checkPageBreak(prepLines.length * 14 + 10);
  doc.text(prepLines, margin, y);
  y += prepLines.length * 14 + 12;

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

      // Build clean paint details: "Amount of paint: 2 Gallons - Emerald (Satin) - Color: Repose Gray"
      let paintDetail = '';
      if (showLinePaint && currentRoomGals > 0) {
        const paintParts: string[] = [];
        paintParts.push(`Amount of paint: ${currentRoomGals} ${currentRoomGals === 1 ? 'Gallon' : 'Gallons'}`);
        if (r.prod && r.prod.trim()) paintParts.push(r.prod.trim());
        if (r.sheen && r.sheen.trim()) paintParts.push(`(${r.sheen.trim()})`);
        if (r.color && r.color.trim()) paintParts.push(`Color: ${r.color.trim()}`);
        paintDetail = paintParts.join(' - ');
      }

      // Room name in crisp bold helvetica (no dash prefix!)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const nameLines = doc.splitTextToSize(roomName, itemTextWidth);

      // Paint lines in light gray tone
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const paintLines = paintDetail
        ? doc.splitTextToSize(paintDetail, itemTextWidth - 10)
        : [];

      const totalLineCount = nameLines.length + paintLines.length;
      const neededHeight = totalLineCount * 14 + 10;
      checkPageBreak(neededHeight);

      const startY = y;

      // 1. Render Room Name (Bold black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      nameLines.forEach((lText: string, lIdx: number) => {
        doc.text(lText, margin, startY + lIdx * 14);
      });

      // 2. Render paint line underneath in genuine light gray tone
      if (paintLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(135, 135, 135); // Classic light gray tone
        paintLines.forEach((pText: string, pIdx: number) => {
          doc.text(pText, margin + 10, startY + (nameLines.length + pIdx) * 13 + 1);
        });
      }

      // 3. Render Price on first line on Right (bold black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`$${roomPrice}`, rightMargin, startY, { align: 'right' });

      // Subtle dashed separator line below item
      const blockBottomY = startY + nameLines.length * 14 + paintLines.length * 13;
      doc.setDrawColor(235, 235, 235);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(margin, blockBottomY + 2, rightMargin, blockBottomY + 2);
      doc.setLineDashPattern([], 0);

      y = blockBottomY + 8;
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

  // 10. TWO-COLUMN LEGAL & WARRANTY POLICIES AT FOOTER
  // Ensure legal policies fit on the bottom or on next page
  if (y + 65 > pageHeight) {
    doc.addPage();
    y = 40;
  }

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(1);
  doc.line(margin, y, rightMargin, y);
  y += 10;

  const colWidth = (contentWidth - 16) / 2;
  const col1X = margin;
  const col2X = margin + colWidth + 16;

  // Row 1: Term 1 & 2
  let row1Y = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text('1. QUALITY & MATERIAL STANDARDS:', col1X, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  const t1Lines = doc.splitTextToSize(
    settings.t1 ||
      'Krueger Painting uses high-quality coatings and prep work for lasting finishes. Standard projects include full two-coat application.',
    colWidth
  );
  doc.text(t1Lines, col1X, row1Y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('2. PAYMENT POLICY:', col2X, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  const t2Lines = doc.splitTextToSize(
    settings.t2 ||
      'A 50% deposit is requested on the first day to initiate work. The remaining balance is due upon physical completion.',
    colWidth
  );
  doc.text(t2Lines, col2X, row1Y + 8);

  // Row 2: Term 3 & 4
  const row1Height = Math.max(t1Lines.length, t2Lines.length) * 8 + 12;
  const row2Y = row1Y + row1Height;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('3. COLOR SELECTION POLICY:', col1X, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  const t3Lines = doc.splitTextToSize(
    settings.t3 ||
      'Final color selections must be provided by the homeowner before the start date. Assistance available upon request.',
    colWidth
  );
  doc.text(t3Lines, col1X, row2Y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('4. EXCLUSIONS & WARRANTY TERMS:', col2X, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  const t4Lines = doc.splitTextToSize(
    settings.t4 ||
      'Warranty excludes damage caused by structural settling or moisture issues. Unforeseen issues will be discussed immediately.',
    colWidth
  );
  doc.text(t4Lines, col2X, row2Y + 8);

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
