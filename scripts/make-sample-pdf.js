import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(rootDir, "server", "pdfs", "javascript-basics-for-rag.md");
const outputPath = path.join(rootDir, "server", "pdfs", "javascript-basics-for-rag.pdf");

const raw = fs.readFileSync(sourcePath, "utf8");

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function stripMarkdown(line) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s*/, "- ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trimEnd();
}

function wrapLine(line, maxLength = 88) {
  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

const lines = raw
  .split(/\r?\n/)
  .flatMap((line) => {
    const clean = stripMarkdown(line);
    if (!clean) {
      return [""];
    }
    return wrapLine(clean);
  });

const pages = [];
let currentPage = [];
const maxLinesPerPage = 48;

for (const line of lines) {
  if (currentPage.length >= maxLinesPerPage) {
    pages.push(currentPage);
    currentPage = [];
  }
  currentPage.push(line);
}

if (currentPage.length > 0) {
  pages.push(currentPage);
}

const objects = [];

function addObject(content) {
  objects.push(content);
  return objects.length;
}

const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
const pagesId = addObject("");
const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const pageIds = [];

for (const pageLines of pages) {
  const textCommands = pageLines
    .map((line) => {
      if (!line) {
        return "T*";
      }
      return `(${escapePdfText(line)}) Tj T*`;
    })
    .join("\n");

  const stream = `BT
/F1 10 Tf
50 770 Td
14 TL
${textCommands}
ET`;

  const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>
stream
${stream}
endstream`);

  const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  pageIds.push(pageId);
}

objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

let pdf = "%PDF-1.4\n";
const offsets = [0];

objects.forEach((content, index) => {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
});

const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";

for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}

pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync(outputPath, pdf, "utf8");
console.log(`Created ${path.relative(rootDir, outputPath)} with ${pages.length} pages.`);
