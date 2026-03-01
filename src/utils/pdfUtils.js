import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Configure PDF worker globally
if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

export const extractTextFromPdf = async (file, maxChars = 50000) => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += `\n${textContent.items.map((item) => item.str).join(" ")}`;
    if (fullText.length > maxChars * 3) break;
  }
  return fullText;
};