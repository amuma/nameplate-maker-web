const state = {
  names: [],
  backgroundDataUrl: "",
};

const el = {
  csvFile: document.getElementById("csvFile"),
  bgFile: document.getElementById("bgFile"),
  jpFont: document.getElementById("jpFont"),
  latinFont: document.getElementById("latinFont"),
  nameColor: document.getElementById("nameColor"),
  overlayOpacity: document.getElementById("overlayOpacity"),
  opacityValue: document.getElementById("opacityValue"),
  pdfButton: document.getElementById("pdfButton"),
  clearButton: document.getElementById("clearButton"),
  previewGrid: document.getElementById("previewGrid"),
  previewEmpty: document.getElementById("previewEmpty"),
  countLabel: document.getElementById("countLabel"),
  status: document.getElementById("status"),
  renderArea: document.getElementById("renderArea"),
};

function setStatus(message, type = "") {
  el.status.textContent = message;
  el.status.className = `status ${type}`.trim();
}

function isJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

function selectedFontFor(name) {
  return isJapanese(name) ? el.jpFont.value : el.latinFont.value;
}

function getNameFromRow(row, fields) {
  const preferred = ["name", "Name", "NAME", "名前", "氏名", "参加者名"];
  const key = preferred.find((candidate) => fields.includes(candidate)) || fields[0];
  return String(row[key] ?? "").trim();
}

async function decodeCsvFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (_) {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

async function handleCsv(file) {
  if (!file) return;
  try {
    const text = await decodeCsvFile(file);
    const result = Papa.parse(text, { header: true, skipEmptyLines: "greedy" });

    if (result.errors.length && !result.data.length) {
      throw new Error(result.errors[0].message);
    }

    const fields = result.meta.fields || [];
    if (!fields.length) throw new Error("CSVのヘッダー行を読み取れませんでした。");

    state.names = result.data
      .map((row) => getNameFromRow(row, fields))
      .filter(Boolean);

    if (!state.names.length) throw new Error("参加者名を取得できませんでした。");

    renderPreview();
    updateReadyState();
  } catch (error) {
    state.names = [];
    renderPreview();
    updateReadyState();
    setStatus(`CSV読み込みエラー: ${error.message}`, "error");
  }
}

function handleBackground(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.backgroundDataUrl = reader.result;
    renderPreview();
    updateReadyState();
  };
  reader.onerror = () => setStatus("背景画像を読み込めませんでした。", "error");
  reader.readAsDataURL(file);
}

function createBadge(name, forRender = false) {
  const badge = document.createElement("div");
  badge.className = "badge";

  if (state.backgroundDataUrl) {
    badge.style.backgroundImage = `url("${state.backgroundDataUrl}")`;
  }

  const box = document.createElement("div");
  box.className = "name-box";
  box.style.backgroundColor = `rgba(0, 0, 0, ${el.overlayOpacity.value})`;

  const nameEl = document.createElement("div");
  nameEl.className = "name";
  nameEl.textContent = name;
  nameEl.style.fontFamily = selectedFontFor(name);
  nameEl.style.color = el.nameColor.value;

  box.appendChild(nameEl);
  badge.appendChild(box);

  if (forRender) {
    nameEl.style.fontSize = "82px";
  }

  return badge;
}

// 1行のまま縮小し、最小サイズでも入らない場合のみ2行に切り替える
function fitName(nameEl, startSize = 82, minSize = 34) {
  const box = nameEl.parentElement;
  const maxWidth = box.clientWidth * 0.90;
  const maxHeight = box.clientHeight * 0.86;

  nameEl.classList.remove("multiline");
  nameEl.style.whiteSpace = "nowrap";
  nameEl.style.fontSize = `${startSize}px`;

  let size = startSize;

  while (nameEl.scrollWidth > maxWidth && size > minSize) {
    size -= 2;
    nameEl.style.fontSize = `${size}px`;
  }

  // 最小サイズでも1行に収まらない場合は2行表示
  if (nameEl.scrollWidth > maxWidth) {
    nameEl.classList.add("multiline");
    nameEl.style.whiteSpace = "normal";
    nameEl.style.fontSize = `${minSize}px`;

    // 2行にしても高さが超える場合だけ、さらに少し縮小する
    size = minSize;
    while ((nameEl.scrollHeight > maxHeight || nameEl.scrollWidth > maxWidth) && size > 24) {
      size -= 1;
      nameEl.style.fontSize = `${size}px`;
    }
  }
}

function fitAllPreviewNames() {
  requestAnimationFrame(() => {
    document.querySelectorAll("#previewGrid .name").forEach((nameEl) => {
      // プレビューは表示サイズに応じた値を使う
      const boxWidth = nameEl.parentElement.clientWidth;
      const start = Math.max(28, Math.min(48, boxWidth * 0.14));
      const min = Math.max(18, Math.min(26, boxWidth * 0.075));
      fitName(nameEl, start, min);
    });
  });
}

function renderPreview() {
  el.previewGrid.innerHTML = "";
  el.countLabel.textContent = `${state.names.length}名`;

  const canPreview = state.names.length > 0 && state.backgroundDataUrl;
  el.previewEmpty.style.display = canPreview ? "none" : "grid";

  if (!canPreview) return;

  const fragment = document.createDocumentFragment();
  state.names.forEach((name) => fragment.appendChild(createBadge(name)));
  el.previewGrid.appendChild(fragment);
  fitAllPreviewNames();
}

function updateReadyState() {
  const ready = state.names.length > 0 && Boolean(state.backgroundDataUrl);
  el.pdfButton.disabled = !ready;

  if (ready) {
    setStatus(`${state.names.length}名分の名札を作成できます。長い名前は自動縮小し、収まらない場合は2行表示します。`, "success");
  } else if (state.names.length > 0) {
    setStatus("CSVを読み込みました。続いて背景画像を選択してください。");
  } else if (state.backgroundDataUrl) {
    setStatus("背景画像を読み込みました。続いて参加者CSVを選択してください。");
  } else {
    setStatus("CSVと背景画像を選択してください。");
  }
}

function refreshStyles() {
  renderPreview();
}

const PDF_DPI = 300;
const PDF_BADGE_W_MM = 80;
const PDF_BADGE_H_MM = 45;
const PDF_BADGE_W_PX = Math.round((PDF_BADGE_W_MM / 25.4) * PDF_DPI);
const PDF_BADGE_H_PX = Math.round(PDF_BADGE_W_PX * PDF_BADGE_H_MM / PDF_BADGE_W_MM);

function waitForTwoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function loadImageForPdf(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("背景画像をPDF用に読み込めませんでした。"));
    image.src = src;
  });
}

function canvasToBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("PDF用画像を圧縮できませんでした。"));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality
    );
  });
}

// 背景は名札ごとに再描画せず、300dpi相当に一度だけ中央トリミングする。
// PDF内では同じ画像エイリアスを再利用するため、12枚でも背景データは1個だけになる。
async function preparePdfBackground() {
  const image = await loadImageForPdf(state.backgroundDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = PDF_BADGE_W_PX;
  canvas.height = PDF_BADGE_H_PX;

  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const targetRatio = PDF_BADGE_W_MM / PDF_BADGE_H_MM;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceW = image.naturalWidth;
  let sourceH = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceW = sourceH * targetRatio;
    sourceX = (image.naturalWidth - sourceW) / 2;
  } else if (sourceRatio < targetRatio) {
    sourceH = sourceW / targetRatio;
    sourceY = (image.naturalHeight - sourceH) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const keepPng = state.backgroundDataUrl.startsWith("data:image/png");
  const mimeType = keepPng ? "image/png" : "image/jpeg";
  const format = keepPng ? "PNG" : "JPEG";
  const bytes = await canvasToBytes(canvas, mimeType, keepPng ? undefined : 0.96);

  canvas.width = 1;
  canvas.height = 1;
  return { bytes, format };
}

// html2canvasには背景を含めず、黒帯と名前だけを透明PNGとして描画する。
// 文字をJPEG化しないため、輪郭のにじみや白い圧縮ノイズが出ない。
function createPdfOverlay(name) {
  const surface = document.createElement("div");
  surface.style.position = "relative";
  surface.style.width = PDF_BADGE_W_PX + "px";
  surface.style.height = PDF_BADGE_H_PX + "px";
  surface.style.overflow = "hidden";
  surface.style.background = "transparent";

  const box = document.createElement("div");
  box.className = "name-box";
  box.style.backgroundColor = "rgba(0, 0, 0, " + el.overlayOpacity.value + ")";
  box.style.borderRadius = "21px";

  const nameEl = document.createElement("div");
  nameEl.className = "name";
  nameEl.textContent = name;
  nameEl.style.fontFamily = selectedFontFor(name);
  nameEl.style.color = el.nameColor.value;

  box.appendChild(nameEl);
  surface.appendChild(box);
  return surface;
}

function splitPdfNameIntoTwoLines(text, nameEl) {
  const trimmed = text.trim();
  let segments;
  let separator = "";

  if (/\s/u.test(trimmed)) {
    segments = trimmed.split(/\s+/u).filter(Boolean);
    separator = " ";
  } else if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    segments = [...segmenter.segment(trimmed)].map((item) => item.segment);
  } else {
    segments = Array.from(trimmed);
  }

  if (segments.length < 2) return [trimmed, ""];

  const style = getComputedStyle(nameEl);
  const measureCanvas = document.createElement("canvas");
  const context = measureCanvas.getContext("2d");
  context.font = style.fontWeight + " 40px " + style.fontFamily;

  let best = null;
  for (let index = 1; index < segments.length; index++) {
    const first = segments.slice(0, index).join(separator);
    const second = segments.slice(index).join(separator);
    const firstWidth = context.measureText(first).width;
    const secondWidth = context.measureText(second).width;
    const score = Math.max(firstWidth, secondWidth) +
      Math.abs(firstWidth - secondWidth) * 0.15;

    if (!best || score < best.score) {
      best = { first, second, score };
    }
  }

  return [best.first, best.second];
}

// 1行を優先して縮小し、最小サイズでも収まらない場合だけ2行へ分割する。
// CSSの自動折り返し任せにせず、各行の実幅を確認して横方向の欠けを防ぐ。
function fitPdfName(nameEl) {
  const name = nameEl.textContent.trim();
  const box = nameEl.parentElement;
  const maxWidth = box.clientWidth * 0.90;
  const maxHeight = PDF_BADGE_H_PX * 0.34;

  nameEl.classList.remove("multiline");
  nameEl.replaceChildren(document.createTextNode(name));
  nameEl.style.display = "block";
  nameEl.style.overflow = "hidden";
  nameEl.style.whiteSpace = "nowrap";

  for (let size = 97; size >= 40; size -= 2) {
    nameEl.style.fontSize = size + "px";
    if (nameEl.scrollWidth <= maxWidth + 0.5) return;
  }

  const lines = splitPdfNameIntoTwoLines(name, nameEl);
  const lineElements = lines.map((line) => {
    const span = document.createElement("span");
    span.textContent = line;
    span.style.display = "block";
    span.style.maxWidth = "100%";
    span.style.whiteSpace = "nowrap";
    return span;
  });

  nameEl.replaceChildren(...lineElements);
  nameEl.style.display = "flex";
  nameEl.style.flexDirection = "column";
  nameEl.style.alignItems = "center";
  nameEl.style.justifyContent = "center";
  nameEl.style.overflow = "visible";
  nameEl.style.whiteSpace = "normal";

  for (let size = 64; size >= 28; size -= 1) {
    nameEl.style.fontSize = size + "px";
    const widthFits = lineElements.every(
      (line) => line.scrollWidth <= maxWidth + 0.5
    );
    if (widthFits && nameEl.scrollHeight <= maxHeight) return;
  }
}

async function renderPdfOverlay(name) {
  const surface = createPdfOverlay(name);
  el.renderArea.replaceChildren(surface);
  await waitForTwoFrames();

  const nameEl = surface.querySelector(".name");
  fitPdfName(nameEl);

  const canvas = await html2canvas(surface, {
    backgroundColor: null,
    scale: 1,
    width: PDF_BADGE_W_PX,
    height: PDF_BADGE_H_PX,
    useCORS: false,
    allowTaint: false,
    logging: false,
    removeContainer: true,
  });

  const bytes = await canvasToBytes(canvas, "image/png");
  canvas.width = 1;
  canvas.height = 1;
  surface.remove();
  return bytes;
}

function drawCutGuides(pdf, metrics) {
  const totalPages = pdf.getNumberOfPages();
  const guideLength = 8;

  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    pdf.setPage(pageNo);
    pdf.setDrawColor(100);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([1.5, 1.5], 0);

    const left = metrics.marginX;
    const right = left + metrics.usedW;
    const top = metrics.marginY;
    const bottom = top + metrics.usedH;
    const verticalCuts = [left, left + metrics.badgeW, right];

    verticalCuts.forEach((cutX) => {
      pdf.line(cutX, top - guideLength, cutX, top);
      pdf.line(cutX, bottom, cutX, bottom + guideLength);
    });

    for (let row = 0; row <= metrics.rows; row++) {
      const cutY = top + row * metrics.badgeH;
      pdf.line(left - guideLength, cutY, left, cutY);
      pdf.line(right, cutY, right + guideLength, cutY);
    }

    pdf.setLineDashPattern([], 0);
  }
}

async function exportPdf() {
  if (el.pdfButton.disabled) return;

  const originalText = el.pdfButton.textContent;
  el.pdfButton.disabled = true;
  el.pdfButton.textContent = "PDF生成中…";
  setStatus("背景画像を印刷用に最適化しています。", "");

  try {
    await document.fonts.ready;

    if (!window.html2canvas || !window.jspdf?.jsPDF) {
      throw new Error("PDF生成ライブラリを読み込めませんでした。ページを再読み込みしてください。");
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      precision: 12,
    });

    const metrics = {
      badgeW: PDF_BADGE_W_MM,
      badgeH: PDF_BADGE_H_MM,
      cols: 2,
      rows: 6,
    };
    metrics.perPage = metrics.cols * metrics.rows;
    metrics.usedW = metrics.cols * metrics.badgeW;
    metrics.usedH = metrics.rows * metrics.badgeH;
    metrics.marginX = (210 - metrics.usedW) / 2;
    metrics.marginY = (297 - metrics.usedH) / 2;

    const background = await preparePdfBackground();

    for (let index = 0; index < state.names.length; index++) {
      if (index > 0 && index % metrics.perPage === 0) {
        pdf.addPage("a4", "portrait");
      }

      const pageIndex = index % metrics.perPage;
      const col = pageIndex % metrics.cols;
      const row = Math.floor(pageIndex / metrics.cols);
      const x = metrics.marginX + col * metrics.badgeW;
      const y = metrics.marginY + row * metrics.badgeH;

      // 同じaliasを指定することで、背景はPDF内に一度だけ埋め込まれる。
      pdf.addImage(
        background.bytes,
        background.format,
        x,
        y,
        metrics.badgeW,
        metrics.badgeH,
        "shared-badge-background",
        "FAST"
      );

      const overlayBytes = await renderPdfOverlay(state.names[index]);
      pdf.addImage(
        overlayBytes,
        "PNG",
        x,
        y,
        metrics.badgeW,
        metrics.badgeH,
        "badge-overlay-" + index,
        "FAST"
      );

      setStatus(
        "PDFを生成しています（" + (index + 1) + " / " + state.names.length + "枚）。",
        ""
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    drawCutGuides(pdf, metrics);
    el.renderArea.replaceChildren();

    pdf.setProperties({
      title: "イベント名札 印刷用PDF",
      subject: "80mm x 45mm / A4 / 2列 x 6行 / 300dpi相当",
      creator: "名札PDFジェネレーター",
    });
    pdf.save("name-badges-a4-print.pdf");
    setStatus(
      "PDFを出力しました。背景は再利用し、文字は可逆圧縮PNGで鮮明に保持しています。",
      "success"
    );
  } catch (error) {
    console.error(error);
    setStatus("PDF生成エラー: " + error.message, "error");
  } finally {
    el.renderArea.replaceChildren();
    el.pdfButton.disabled = !(state.names.length && state.backgroundDataUrl);
    el.pdfButton.textContent = originalText;
  }
}
function clearAll() {
  state.names = [];
  state.backgroundDataUrl = "";
  el.csvFile.value = "";
  el.bgFile.value = "";
  el.renderArea.innerHTML = "";
  renderPreview();
  updateReadyState();
}

el.csvFile.addEventListener("change", (e) => handleCsv(e.target.files[0]));
el.bgFile.addEventListener("change", (e) => handleBackground(e.target.files[0]));
el.jpFont.addEventListener("change", refreshStyles);
el.latinFont.addEventListener("change", refreshStyles);
el.nameColor.addEventListener("input", refreshStyles);
el.overlayOpacity.addEventListener("input", () => {
  el.opacityValue.textContent = `${Math.round(Number(el.overlayOpacity.value) * 100)}%`;
  refreshStyles();
});
el.pdfButton.addEventListener("click", exportPdf);
el.clearButton.addEventListener("click", clearAll);

window.addEventListener("resize", fitAllPreviewNames);
updateReadyState();
