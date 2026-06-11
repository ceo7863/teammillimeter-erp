import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const A4_WIDTH_PX = 794;

export async function downloadWorkerHrRecordPdf(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    width: A4_WIDTH_PX,
    windowWidth: A4_WIDTH_PX,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const margin = 8;
  const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;
  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const imgHeight = (canvas.height * printableWidth) / canvas.width;

  let pageIndex = 0;
  let remaining = imgHeight;

  while (remaining > 0) {
    if (pageIndex > 0) pdf.addPage("a4", "portrait");
    const y = margin - pageIndex * printableHeight;
    pdf.addImage(imgData, "JPEG", margin, y, printableWidth, imgHeight);
    remaining -= printableHeight;
    pageIndex += 1;
  }

  pdf.save(fileName);
}
