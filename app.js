const modes = {
  image: {
    title: "Image converter",
    hint: "PNG, JPG, GIF, BMP, or WebP",
    accept: "image/*",
  },
  document: {
    title: "Text converter",
    hint: "TXT, Markdown, or HTML",
    accept: ".txt,.md,.html,.htm,text/*",
  },
  data: {
    title: "Data converter",
    hint: "JSON or CSV",
    accept: ".json,.csv,application/json,text/csv",
  },
  base64: {
    title: "Base64 converter",
    hint: "Any file to encode, or paste Base64 text to decode",
    accept: "*/*",
  },
  files: {
    title: "File extension converter",
    hint: "PDF, DOCX, TXT, RTF, or EPUB",
    accept: ".pdf,.docx,.txt,.rtf,.epub,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,text/plain,application/rtf",
  },
};

const state = {
  mode: "image",
  file: null,
  convertedUrl: null,
  convertedName: "",
};

const els = {
  tabs: [...document.querySelectorAll(".tab-button")],
  modeTitle: document.querySelector("#modeTitle"),
  dropHint: document.querySelector("#dropHint"),
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  browseButton: document.querySelector("#browseButton"),
  previewStage: document.querySelector("#previewStage"),
  fileMeta: document.querySelector("#fileMeta"),
  conversionStatus: document.querySelector("#conversionStatus"),
  imageFormat: document.querySelector("#imageFormat"),
  qualityRange: document.querySelector("#qualityRange"),
  qualityValue: document.querySelector("#qualityValue"),
  textFormat: document.querySelector("#textFormat"),
  dataFormat: document.querySelector("#dataFormat"),
  base64Format: document.querySelector("#base64Format"),
  fileFormat: document.querySelector("#fileFormat"),
  convertButton: document.querySelector("#convertButton"),
  downloadButton: document.querySelector("#downloadButton"),
  resetButton: document.querySelector("#resetButton"),
  textEditor: document.querySelector("#textEditor"),
  textInput: document.querySelector("#textInput"),
  textOutput: document.querySelector("#textOutput"),
};

els.tabs.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

els.browseButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  const [file] = els.fileInput.files;
  if (file) loadFile(file);
});

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});

els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("dragging");
});

els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  const [file] = event.dataTransfer.files;
  if (file) loadFile(file);
});

els.qualityRange.addEventListener("input", () => {
  els.qualityValue.textContent = `${els.qualityRange.value}%`;
});

els.convertButton.addEventListener("click", convertCurrent);
els.resetButton.addEventListener("click", resetAll);
els.base64Format.addEventListener("change", updateBase64Mode);

function setMode(mode) {
  state.mode = mode;
  clearConversion();

  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  els.modeTitle.textContent = modes[mode].title;
  els.dropHint.textContent = modes[mode].hint;
  els.fileInput.accept = modes[mode].accept;

  document.querySelectorAll(".image-only").forEach((el) => el.classList.toggle("hidden", mode !== "image"));
  document.querySelectorAll(".text-only").forEach((el) => el.classList.toggle("hidden", mode !== "document"));
  document.querySelectorAll(".data-only").forEach((el) => el.classList.toggle("hidden", mode !== "data"));
  document.querySelectorAll(".base64-only").forEach((el) => el.classList.toggle("hidden", mode !== "base64"));
  document.querySelectorAll(".files-only").forEach((el) => el.classList.toggle("hidden", mode !== "files"));

  els.textEditor.classList.toggle("hidden", !["document", "data", "base64", "files"].includes(mode));
  els.dropZone.classList.remove("hidden");
  updateBase64Mode();
  renderPreview();
}

async function loadFile(file) {
  state.file = file;
  clearConversion();
  els.fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;

  if (state.mode === "image") {
    const url = URL.createObjectURL(file);
    els.previewStage.innerHTML = "";
    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(url);
    els.previewStage.append(img);
    return;
  }

  if (state.mode === "files") {
    try {
      const text = await extractFileText(file);
      els.textInput.value = text;
      renderPreview(text);
    } catch (error) {
      els.textInput.value = "";
      renderPreview("");
      setStatus(error.message || "Could not read file");
    }
    return;
  }

  const text = await file.text().catch(() => "");
  els.textInput.value = text;
  renderPreview(text);
}

async function convertCurrent() {
  try {
    setStatus("Converting...");
    clearConversion();

    if (state.mode === "image") {
      await convertImage();
    } else if (state.mode === "document") {
      convertDocument();
    } else if (state.mode === "data") {
      convertData();
    } else if (state.mode === "files") {
      await convertFileExtension();
    } else {
      await convertBase64();
    }

    setStatus("Converted");
  } catch (error) {
    setStatus(error.message || "Conversion failed");
  }
}

async function convertFileExtension() {
  const target = els.fileFormat.value;
  const inputText = els.textInput.value.trim();
  const text = inputText || (state.file ? await extractFileText(state.file) : "");
  if (!text) throw new Error("Choose a file or paste text to convert");

  let blob;
  if (target === "pdf") {
    blob = createPdfBlob(text);
  } else if (target === "docx") {
    blob = createDocxBlob(text);
  } else if (target === "txt") {
    blob = new Blob([text], { type: "text/plain" });
  } else if (target === "rtf") {
    blob = new Blob([textToRtf(text)], { type: "application/rtf" });
  } else {
    blob = createEpubBlob(text);
  }

  els.textOutput.value = text;
  renderPreview(text);
  makeDownload(blob, renameForTarget(state.file?.name || "converted.txt", target));
}

async function convertImage() {
  if (!state.file) throw new Error("Choose an image first");

  const image = await createImageBitmap(state.file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  const mime = els.imageFormat.value;
  const quality = Number(els.qualityRange.value) / 100;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error("This browser could not export that format");

  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  makeDownload(blob, renameExtension(state.file.name, ext));
}

function convertDocument() {
  const input = els.textInput.value;
  if (!input.trim()) throw new Error("Add text to convert");

  const target = els.textFormat.value;
  let output = input;
  let type = "text/plain";

  if (target === "html") {
    output = markdownToHtml(input);
    type = "text/html";
  } else if (target === "md") {
    output = htmlToMarkdown(input);
    type = "text/markdown";
  } else {
    output = stripHtml(input);
  }

  els.textOutput.value = output;
  renderPreview(output);
  makeDownload(new Blob([output], { type }), `converted.${target}`);
}

function convertData() {
  const input = els.textInput.value.trim();
  if (!input) throw new Error("Add JSON or CSV to convert");

  const source = detectDataSource(input);
  const target = els.dataFormat.value;
  let output = "";
  let type = "text/plain";

  if (target === "json") {
    const data = source === "json" ? JSON.parse(input) : csvToRows(input);
    output = JSON.stringify(data, null, 2);
    type = "application/json";
  } else if (target === "csv") {
    const data = source === "json" ? jsonToRows(JSON.parse(input)) : csvToRows(input);
    output = rowsToCsv(data);
    type = "text/csv";
  } else {
    const parsed = source === "json" ? JSON.parse(input) : csvToRows(input);
    const rows = Array.isArray(parsed[0]) ? parsed : jsonToRows(parsed);
    output = rows.map((row) => row.join("\t")).join("\n");
  }

  els.textOutput.value = output;
  renderPreview(output);
  makeDownload(new Blob([output], { type }), `converted.${target}`);
}

async function convertBase64() {
  if (els.base64Format.value === "encode") {
    if (!state.file) throw new Error("Choose a file to encode");
    const dataUrl = await readAsDataUrl(state.file);
    const output = dataUrl.split(",")[1];
    els.textOutput.value = output;
    makeDownload(new Blob([output], { type: "text/plain" }), `${state.file.name}.base64.txt`);
    return;
  }

  const input = els.textInput.value.trim();
  if (!input) throw new Error("Paste Base64 text to decode");
  const clean = input.includes(",") ? input.split(",").pop() : input;
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  makeDownload(new Blob([bytes]), "decoded-file");
  els.textOutput.value = "Decoded file is ready to download.";
}

function updateBase64Mode() {
  if (state.mode !== "base64") return;
  const decoding = els.base64Format.value === "decode";
  els.dropZone.classList.toggle("hidden", decoding);
}

function renderPreview(text = els.textOutput.value || els.textInput.value) {
  if (state.mode === "image" && !state.file) {
    els.previewStage.innerHTML = "<p>Select a file to begin.</p>";
    return;
  }

  if (state.mode !== "image") {
    els.previewStage.innerHTML = "";
    const pre = document.createElement("pre");
    pre.textContent = text || "Paste text or choose a file to begin.";
    els.previewStage.append(pre);
  }
}

async function extractFileText(file) {
  const ext = getExtension(file.name);
  if (ext === "docx") return extractDocxText(await file.arrayBuffer());
  if (ext === "epub") return extractEpubText(await file.arrayBuffer());
  if (ext === "pdf") return extractPdfText(await file.arrayBuffer());
  if (ext === "rtf") return rtfToText(await file.text());
  return file.text().catch(() => "");
}

function makeDownload(blob, filename) {
  state.convertedUrl = URL.createObjectURL(blob);
  state.convertedName = filename;
  els.downloadButton.href = state.convertedUrl;
  els.downloadButton.download = filename;
  els.downloadButton.classList.remove("disabled");
}

function clearConversion() {
  if (state.convertedUrl) URL.revokeObjectURL(state.convertedUrl);
  state.convertedUrl = null;
  state.convertedName = "";
  els.downloadButton.href = "#";
  els.downloadButton.download = "";
  els.downloadButton.classList.add("disabled");
  setStatus("Ready");
}

function resetAll() {
  clearConversion();
  state.file = null;
  els.fileInput.value = "";
  els.textInput.value = "";
  els.textOutput.value = "";
  els.fileMeta.textContent = "No file loaded";
  els.dropZone.classList.remove("hidden");
  renderPreview("");
}

function setStatus(message) {
  els.conversionStatus.textContent = message;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function renameExtension(filename, extension) {
  return `${filename.replace(/\.[^/.]+$/, "")}.${extension}`;
}

function renameForTarget(filename, extension) {
  return renameExtension(filename.includes(".") ? filename : `${filename}.txt`, extension);
}

function getExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function markdownToHtml(markdown) {
  const body = markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith("# ")) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("### ")) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (/^- /.test(trimmed)) {
        const items = trimmed
          .split("\n")
          .map((item) => `<li>${formatInlineMarkdown(item.replace(/^- /, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${formatInlineMarkdown(trimmed).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Converted document</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

function formatInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.innerHTML
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, "### $1\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gis, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gis, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gis, "*$1*")
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n")
    .replace(/<br\s*\/?>/gis, "\n")
    .replace(/<\/p>/gis, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value) {
  return new DOMParser().parseFromString(value, "text/html").body.textContent || value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function detectDataSource(input) {
  if (input.startsWith("{") || input.startsWith("[")) return "json";
  return "csv";
}

function jsonToRows(data) {
  const records = Array.isArray(data) ? data : [data];
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return [headers, ...records.map((record) => headers.map((header) => record[header] ?? ""))];
}

function csvToRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  if (rows.length < 2) return rows;
  const [headers, ...values] = rows;
  return values.map((valueRow) => Object.fromEntries(headers.map((header, index) => [header, valueRow[index] ?? ""])));
}

function rowsToCsv(data) {
  const rows = Array.isArray(data[0]) ? data : jsonToRows(data);
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

function rtfToText(rtf) {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textToRtf(text) {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\n/g, "\\par\n");
  return `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Arial;}}\n\\f0\\fs24\n${escaped}\n}`;
}

function createPdfBlob(text) {
  const encoder = new TextEncoder();
  const lines = wrapText(text.replace(/\r/g, ""), 84).slice(0, 900);
  const content = [
    "BT",
    "/F1 11 Tf",
    "14 TL",
    "50 760 Td",
    ...lines.flatMap((line, index) => {
      const escaped = escapePdfText(line);
      return index === 0 ? [`(${escaped}) Tj`] : ["T*", `(${escaped}) Tj`];
    }),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function createDocxBlob(text) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${text
      .split(/\n+/)
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
      .join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  return createZipBlob(
    [
      {
        name: "[Content_Types].xml",
        text: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      },
      {
        name: "_rels/.rels",
        text: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      },
      { name: "word/document.xml", text: documentXml },
    ],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}

function createEpubBlob(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeXml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return createZipBlob(
    [
      { name: "mimetype", text: "application/epub+zip" },
      {
        name: "META-INF/container.xml",
        text: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
      },
      {
        name: "OEBPS/content.opf",
        text: `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">converted</dc:identifier><dc:title>Converted Document</dc:title><dc:language>en</dc:language></metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`,
      },
      {
        name: "OEBPS/chapter.xhtml",
        text: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Converted Document</title></head><body>${paragraphs}</body></html>`,
      },
    ],
    "application/epub+zip",
  );
}

async function extractDocxText(buffer) {
  const files = await unzipFiles(buffer);
  const xml = files.get("word/document.xml");
  if (!xml) throw new Error("Could not read DOCX document text");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("w:t")]
    .map((node) => node.textContent)
    .join(" ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

async function extractEpubText(buffer) {
  const files = await unzipFiles(buffer);
  const text = [...files.entries()]
    .filter(([name]) => /\.(xhtml|html|htm)$/i.test(name))
    .map(([, value]) => stripHtml(value))
    .join("\n\n")
    .trim();
  if (!text) throw new Error("Could not read EPUB text");
  return text;
}

async function extractPdfText(buffer) {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" ").trim());
    }

    const text = pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
    if (!text) throw new Error("This PDF does not contain selectable text");
    return text;
  }

  const bytes = new Uint8Array(buffer);
  const source = new TextDecoder("latin1").decode(bytes);
  const snippets = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const arrayPattern = /\[(.*?)\]\s*TJ/gs;
  let match;

  while ((match = literalPattern.exec(source))) {
    snippets.push(decodePdfLiteral(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  }

  while ((match = arrayPattern.exec(source))) {
    const parts = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((part) => decodePdfLiteral(part[0].slice(1, -1)));
    if (parts.length) snippets.push(parts.join(""));
  }

  const text = snippets.join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Could not extract text from this PDF. Check your internet connection so PDF.js can load, or try a PDF with selectable text.");
  return text;
}

function createZipBlob(entries, mimeType) {
  const encoder = new TextEncoder();
  const fileParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.bytes || encoder.encode(entry.text || "");
    const crc = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    fileParts.push(localHeader, data);

    centralParts.push(
      concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ]);

  return new Blob([...fileParts, ...centralParts, end], { type: mimeType });
}

async function unzipFiles(buffer) {
  const bytes = new Uint8Array(buffer);
  const files = new Map();
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error("Could not read packaged file");

  const entryCount = readU16(bytes, eocdOffset + 10);
  let position = readU32(bytes, eocdOffset + 16);

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (readU32(bytes, position) !== 0x02014b50) break;
    const method = readU16(bytes, position + 10);
    const compressedSize = readU32(bytes, position + 20);
    const uncompressedSize = readU32(bytes, position + 24);
    const nameLength = readU16(bytes, position + 28);
    const extraLength = readU16(bytes, position + 30);
    const commentLength = readU16(bytes, position + 32);
    const localOffset = readU32(bytes, position + 42);
    const nameStart = position + 46;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;

    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }

    if (uncompressedSize && data.length !== uncompressedSize) {
      data = data.slice(0, uncompressedSize);
    }
    if (!name.endsWith("/")) files.set(name, new TextDecoder().decode(data));
    position = nameStart + nameLength + extraLength + commentLength;
  }

  if (!files.size) throw new Error("Could not read packaged file");
  return files;
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) return i;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot unpack compressed DOCX or EPUB files");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function wrapText(text, width) {
  const lines = [];
  text.split("\n").forEach((sourceLine) => {
    let line = "";
    sourceLine.split(/\s+/).forEach((word) => {
      if (!word) return;
      if (`${line} ${word}`.trim().length > width) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    });
    lines.push(line);
  });
  return lines;
}

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
    return entities[char];
  });
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function readU16(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readU32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

setMode("image");
