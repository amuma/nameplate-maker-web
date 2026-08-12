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

function createOpaqueCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    alpha: false,
    colorSpace: "srgb",
  });
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

// 背景はsRGBの不透明Canvasへ一度だけ中央トリミングする。
// JPEG品質98%で保存し、PDF内では同じ画像を全名札で再利用する。
async function preparePdfBackground() {
  const image = await loadImageForPdf(state.backgroundDataUrl);
  const { canvas, context } = createOpaqueCanvas(
    PDF_BADGE_W_PX,
    PDF_BADGE_H_PX
  );

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

  return {
    canvas,
    bytes: await canvasToBytes(canvas, "image/jpeg", 0.98),
  };
}

function splitPdfNameIntoTwoLines(text, context, fontFamily) {
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

  context.font = "900 40px " + fontFamily;
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

function fitPdfName(context, name, fontFamily, maxWidth, maxHeight) {
  for (let size = 97; size >= 40; size -= 2) {
    context.font = "900 " + size + "px " + fontFamily;
    if (context.measureText(name).width <= maxWidth) {
      return { lines: [name], size };
    }
  }

  const lines = splitPdfNameIntoTwoLines(name, context, fontFamily);
  for (let size = 64; size >= 28; size -= 1) {
    context.font = "900 " + size + "px " + fontFamily;
    const lineHeight = size * 1.08;
    const widthFits = lines.every(
      (line) => context.measureText(line).width <= maxWidth
    );
    if (widthFits && lineHeight * lines.length <= maxHeight) {
      return { lines, size };
    }
  }

  return { lines, size: 28 };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

// 透明PNGやPDF透明マスクを使わず、背景の該当部分・黒帯・文字を
// 小さな不透明JPEGパッチへ合成する。白ボケの原因となる透明度合成を残さない。
async function renderPdfNamePatch(baseCanvas, name) {
  const patchX = Math.round(PDF_BADGE_W_PX * 0.05);
  const patchW = PDF_BADGE_W_PX - patchX * 2;
  const patchH = Math.round(PDF_BADGE_H_PX * 0.38);
  const patchY = Math.round((PDF_BADGE_H_PX - patchH) / 2);
  const { canvas, context } = createOpaqueCanvas(patchW, patchH);

  context.drawImage(
    baseCanvas,
    patchX,
    patchY,
    patchW,
    patchH,
    0,
    0,
    patchW,
    patchH
  );

  roundedRectPath(context, 0, 0, patchW, patchH, 21);
  context.fillStyle =
    "rgba(0, 0, 0, " + Number(el.overlayOpacity.value) + ")";
  context.fill();

  const fontFamily = selectedFontFor(name);
  const fitted = fitPdfName(
    context,
    name,
    fontFamily,
    patchW * 0.90,
    patchH * 0.82
  );

  context.font = "900 " + fitted.size + "px " + fontFamily;
  context.fillStyle = el.nameColor.value;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lineHeight = fitted.size * 1.08;
  const firstY =
    patchH / 2 - ((fitted.lines.length - 1) * lineHeight) / 2;
  fitted.lines.forEach((line, lineIndex) => {
    context.fillText(
      line,
      patchW / 2,
      firstY + lineIndex * lineHeight,
      patchW * 0.90
    );
  });

  const bytes = await canvasToBytes(canvas, "image/jpeg", 0.98);
  canvas.width = 1;
  canvas.height = 1;

  return {
    bytes,
    xRatio: patchX / PDF_BADGE_W_PX,
    yRatio: patchY / PDF_BADGE_H_PX,
    widthRatio: patchW / PDF_BADGE_W_PX,
    heightRatio: patchH / PDF_BADGE_H_PX,
  };
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

    if (!window.jspdf?.jsPDF) {
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
        "JPEG",
        x,
        y,
        metrics.badgeW,
        metrics.badgeH,
        "shared-badge-background",
        "FAST"
      );

      const namePatch = await renderPdfNamePatch(
        background.canvas,
        state.names[index]
      );
      pdf.addImage(
        namePatch.bytes,
        "JPEG",
        x + metrics.badgeW * namePatch.xRatio,
        y + metrics.badgeH * namePatch.yRatio,
        metrics.badgeW * namePatch.widthRatio,
        metrics.badgeH * namePatch.heightRatio,
        "badge-name-patch-" + index,
        "FAST"
      );

      setStatus(
        "PDFを生成しています（" + (index + 1) + " / " + state.names.length + "枚）。",
        ""
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    drawCutGuides(pdf, metrics);
    background.canvas.width = 1;
    background.canvas.height = 1;
    el.renderArea.replaceChildren();

    pdf.setProperties({
      title: "イベント名札 印刷用PDF",
      subject: "80mm x 45mm / A4 / 2列 x 6行 / 300dpi相当",
      creator: "名札PDFジェネレーター",
    });
    pdf.save("name-badges-a4-print.pdf");
    setStatus(
      "PDFを出力しました。透明レイヤーを使わず、不透明画像として合成しています。",
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
