import ExcelJS from 'exceljs';
// @ts-ignore
import PDFDocument from 'pdfkit';

export interface DeliveryExportItem {
  trackingCode: string;
  orderNumber?: string;
  customerName: string;
  customerPhone: string;
  riderName?: string;
  restaurantName?: string;
  pickupLocation: string;
  destination: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  riderFee: number;
  isPaidToRider: boolean;
  createdAt: string;
}

export class ExportUtils {
  /**
   * Generate CSV format string
   */
  static generateCsv(items: DeliveryExportItem[]): string {
    const headers = [
      'Tracking Code',
      'Order Number',
      'Customer Name',
      'Customer Phone',
      'Rider Name',
      'Restaurant',
      'Pickup Location',
      'Destination',
      'Status',
      'Payment Method',
      'Total Amount (ETB)',
      'Rider Fee (ETB)',
      'Rider Paid',
      'Created At',
    ];

    const rows = items.map((it) => [
      `"${it.trackingCode}"`,
      `"${it.orderNumber || 'N/A'}"`,
      `"${(it.customerName || '').replace(/"/g, '""')}"`,
      `"${it.customerPhone || ''}"`,
      `"${(it.riderName || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(it.restaurantName || 'N/A').replace(/"/g, '""')}"`,
      `"${(it.pickupLocation || '').replace(/"/g, '""')}"`,
      `"${(it.destination || '').replace(/"/g, '""')}"`,
      `"${it.status}"`,
      `"${it.paymentMethod}"`,
      it.totalAmount.toFixed(2),
      it.riderFee.toFixed(2),
      it.isPaidToRider ? 'YES' : 'NO',
      `"${it.createdAt}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Generate Excel (.xlsx) buffer using ExcelJS
   */
  static async generateExcel(items: DeliveryExportItem[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Balerra Delivery Management Platform';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Deliveries Report', {
      pageSetup: { orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'Tracking Code', key: 'trackingCode', width: 20 },
      { header: 'Order Number', key: 'orderNumber', width: 18 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Customer Phone', key: 'customerPhone', width: 16 },
      { header: 'Rider Name', key: 'riderName', width: 20 },
      { header: 'Restaurant', key: 'restaurantName', width: 22 },
      { header: 'Pickup Location', key: 'pickupLocation', width: 25 },
      { header: 'Destination', key: 'destination', width: 25 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Payment Method', key: 'paymentMethod', width: 18 },
      { header: 'Total (ETB)', key: 'totalAmount', width: 14 },
      { header: 'Rider Fee (ETB)', key: 'riderFee', width: 16 },
      { header: 'Rider Paid', key: 'isPaidToRider', width: 12 },
      { header: 'Date', key: 'createdAt', width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0047BA' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    items.forEach((it) => {
      sheet.addRow({
        trackingCode: it.trackingCode,
        orderNumber: it.orderNumber || 'N/A',
        customerName: it.customerName,
        customerPhone: it.customerPhone,
        riderName: it.riderName || 'Unassigned',
        restaurantName: it.restaurantName || 'N/A',
        pickupLocation: it.pickupLocation,
        destination: it.destination,
        status: it.status,
        paymentMethod: it.paymentMethod,
        totalAmount: it.totalAmount,
        riderFee: it.riderFee,
        isPaidToRider: it.isPaidToRider ? 'Paid' : 'Unpaid',
        createdAt: it.createdAt,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate PDF Document buffer using PDFKit
   */
  static async generatePdf(items: DeliveryExportItem[], title = 'Delivery Reports'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: any) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: any) => reject(err));

      // Title & Header
      doc.fontSize(18).fillColor('#0047BA').text('Balerra Delivery Management Platform', { align: 'center' });
      doc.fontSize(12).fillColor('#333333').text(`${title} - Generated on ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1);

      // Summary
      const totalRevenue = items.reduce((sum, it) => sum + it.totalAmount, 0);
      const totalRiderFees = items.reduce((sum, it) => sum + it.riderFee, 0);
      doc.fontSize(10).fillColor('#444444').text(
        `Total Deliveries: ${items.length}  |  Total Order Volume: ${totalRevenue.toFixed(2)} ETB  |  Total Rider Fees: ${totalRiderFees.toFixed(2)} ETB`,
        { align: 'center' }
      );
      doc.moveDown(1);

      // Simple Table Rows
      const startX = 30;
      let startY = doc.y;
      const rowHeight = 22;

      // Table Header
      doc.rect(startX, startY, 782, rowHeight).fill('#0047BA');
      doc.fontSize(9).fillColor('#FFFFFF');
      doc.text('Tracking Code', startX + 5, startY + 6, { width: 90 });
      doc.text('Order #', startX + 100, startY + 6, { width: 75 });
      doc.text('Customer', startX + 180, startY + 6, { width: 100 });
      doc.text('Rider', startX + 285, startY + 6, { width: 95 });
      doc.text('Status', startX + 385, startY + 6, { width: 80 });
      doc.text('Total (ETB)', startX + 470, startY + 6, { width: 70, align: 'right' });
      doc.text('Rider Fee', startX + 545, startY + 6, { width: 65, align: 'right' });
      doc.text('Payout', startX + 615, startY + 6, { width: 55, align: 'center' });
      doc.text('Date', startX + 675, startY + 6, { width: 100 });

      startY += rowHeight;

      // Rows
      items.slice(0, 100).forEach((it, index) => {
        if (startY > 520) {
          doc.addPage({ layout: 'landscape', margin: 30 });
          startY = 40;
        }

        const bg = index % 2 === 0 ? '#F9FBFD' : '#FFFFFF';
        doc.rect(startX, startY, 782, rowHeight).fill(bg);

        doc.fontSize(8).fillColor('#222222');
        doc.text(it.trackingCode, startX + 5, startY + 6, { width: 90 });
        doc.text(it.orderNumber || 'N/A', startX + 100, startY + 6, { width: 75 });
        doc.text(it.customerName || 'N/A', startX + 180, startY + 6, { width: 100 });
        doc.text(it.riderName || 'Unassigned', startX + 285, startY + 6, { width: 95 });
        doc.text(it.status, startX + 385, startY + 6, { width: 80 });
        doc.text(it.totalAmount.toFixed(2), startX + 470, startY + 6, { width: 70, align: 'right' });
        doc.text(it.riderFee.toFixed(2), startX + 545, startY + 6, { width: 65, align: 'right' });
        doc.text(it.isPaidToRider ? 'Paid' : 'Unpaid', startX + 615, startY + 6, { width: 55, align: 'center' });
        doc.text(it.createdAt.substring(0, 16), startX + 675, startY + 6, { width: 100 });

        startY += rowHeight;
      });

      if (items.length > 100) {
        doc.fontSize(8).fillColor('#777777').text(`* Showing first 100 deliveries of ${items.length} total. Export to Excel or CSV for the complete list.`, startX + 5, startY + 8);
      }

      doc.end();
    });
  }
}
