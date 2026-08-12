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
  badgeWidth: document.getElementById("badgeWidth"),
  badgeHeight: document.getElementById("badgeHeight"),
  layoutSummary: document.getElementById("layoutSummary"),
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

  try {
    const metrics = getPrintMetrics();
    badge.style.aspectRatio = `${metrics.badgeW} / ${metrics.badgeH}`;
  } catch (_) {
    badge.style.aspectRatio = "16 / 9";
  }

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
  const sizeReady = updateSizeSettings();
  const ready =
    state.names.length > 0 && Boolean(state.backgroundDataUrl) && sizeReady;
  el.pdfButton.disabled = !ready;

  if (!sizeReady) {
    setStatus("印刷サイズを確認してください。", "error");
  } else if (ready) {
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
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const GUIDE_LENGTH_MM = 8;

function getPrintMetrics() {
  const badgeW = Number(el.badgeWidth.value);
  const badgeH = Number(el.badgeHeight.value);

  if (!Number.isFinite(badgeW) || badgeW < 20 || badgeW > 194) {
    throw new Error("横幅は20mm以上194mm以下で指定してください。");
  }
  if (!Number.isFinite(badgeH) || badgeH < 20 || badgeH > 281) {
    throw new Error("縦幅は20mm以上281mm以下で指定してください。");
  }

  // 裁断ガイド8mmを用紙内に残したうえで、隙間0mmの最大配置数を求める。
  const cols = Math.max(
    1,
    Math.floor((A4_WIDTH_MM - GUIDE_LENGTH_MM * 2) / badgeW)
  );
  const rows = Math.max(
    1,
    Math.floor((A4_HEIGHT_MM - GUIDE_LENGTH_MM * 2) / badgeH)
  );
  const usedW = cols * badgeW;
  const usedH = rows * badgeH;

  return {
    badgeW,
    badgeH,
    badgeWPx: Math.max(1, Math.round((badgeW / 25.4) * PDF_DPI)),
    badgeHPx: Math.max(1, Math.round((badgeH / 25.4) * PDF_DPI)),
    cols,
    rows,
    perPage: cols * rows,
    usedW,
    usedH,
    marginX: (A4_WIDTH_MM - usedW) / 2,
    marginY: (A4_HEIGHT_MM - usedH) / 2,
  };
}

function updateSizeSettings() {
  try {
    const metrics = getPrintMetrics();
    el.layoutSummary.textContent =
      `A4縦に${metrics.cols}列 × ${metrics.rows}行` +
      `（最大${metrics.perPage}枚）で配置します。`;
    el.layoutSummary.classList.remove("error-text");
    return true;
  } catch (error) {
    el.layoutSummary.textContent = error.message;
    el.layoutSummary.classList.add("error-text");
    return false;
  }
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
async function preparePdfBackground(metrics) {
  const image = await loadImageForPdf(state.backgroundDataUrl);
  const { canvas, context } = createOpaqueCanvas(
    metrics.badgeWPx,
    metrics.badgeHPx
  );

  const targetRatio = metrics.badgeW / metrics.badgeH;
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

function fitPdfName(context, name, fontFamily, maxWidth, maxHeight, metrics) {
  const startSize = Math.max(28, Math.round(metrics.badgeHPx * 0.182));
  const minSingleSize = Math.max(14, Math.round(metrics.badgeHPx * 0.075));
  const singleStep = Math.max(1, Math.round(startSize / 48));

  for (let size = startSize; size >= minSingleSize; size -= singleStep) {
    context.font = "900 " + size + "px " + fontFamily;
    if (context.measureText(name).width <= maxWidth) {
      return { lines: [name], size };
    }
  }

  const lines = splitPdfNameIntoTwoLines(name, context, fontFamily);
  const twoLineStart = Math.max(22, Math.round(metrics.badgeHPx * 0.12));
  const twoLineMinimum = Math.max(12, Math.round(metrics.badgeHPx * 0.052));
  const twoLineStep = Math.max(1, Math.round(twoLineStart / 48));

  for (
    let size = twoLineStart;
    size >= twoLineMinimum;
    size -= twoLineStep
  ) {
    context.font = "900 " + size + "px " + fontFamily;
    const lineHeight = size * 1.08;
    const widthFits = lines.every(
      (line) => context.measureText(line).width <= maxWidth
    );
    if (widthFits && lineHeight * lines.length <= maxHeight) {
      return { lines, size };
    }
  }

  return { lines, size: twoLineMinimum };
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
async function renderPdfNamePatch(baseCanvas, name, metrics) {
  const patchX = Math.round(metrics.badgeWPx * 0.05);
  const patchW = metrics.badgeWPx - patchX * 2;
  const patchH = Math.round(metrics.badgeHPx * 0.38);
  const patchY = Math.round((metrics.badgeHPx - patchH) / 2);
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

  roundedRectPath(
    context,
    0,
    0,
    patchW,
    patchH,
    Math.max(6, Math.round(metrics.badgeHPx * 0.04))
  );
  context.fillStyle =
    "rgba(0, 0, 0, " + Number(el.overlayOpacity.value) + ")";
  context.fill();

  const fontFamily = selectedFontFor(name);
  const fitted = fitPdfName(
    context,
    name,
    fontFamily,
    patchW * 0.90,
    patchH * 0.82,
    metrics
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
    xRatio: patchX / metrics.badgeWPx,
    yRatio: patchY / metrics.badgeHPx,
    widthRatio: patchW / metrics.badgeWPx,
    heightRatio: patchH / metrics.badgeHPx,
  };
}
function drawCutGuides(pdf, metrics) {
  const totalPages = pdf.getNumberOfPages();
  const guideLength = GUIDE_LENGTH_MM;

  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    pdf.setPage(pageNo);
    pdf.setDrawColor(100);
    pdf.setLineWidth(0.2);
    pdf.setLineDashPattern([1.5, 1.5], 0);

    const left = metrics.marginX;
    const right = left + metrics.usedW;
    const top = metrics.marginY;
    const bottom = top + metrics.usedH;
    for (let col = 0; col <= metrics.cols; col++) {
      const cutX = left + col * metrics.badgeW;
      pdf.line(cutX, top - guideLength, cutX, top);
      pdf.line(cutX, bottom, cutX, bottom + guideLength);
    }

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

    const metrics = getPrintMetrics();

    const background = await preparePdfBackground(metrics);

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
        state.names[index],
        metrics
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
      subject:
        `${metrics.badgeW}mm x ${metrics.badgeH}mm / A4 / ` +
        `${metrics.cols}列 x ${metrics.rows}行 / 300dpi相当`,
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
    el.pdfButton.disabled = !(
      state.names.length &&
      state.backgroundDataUrl &&
      updateSizeSettings()
    );
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
function handleSizeInput() {
  updateReadyState();
  renderPreview();
}
el.badgeWidth.addEventListener("input", handleSizeInput);
el.badgeHeight.addEventListener("input", handleSizeInput);
el.pdfButton.addEventListener("click", exportPdf);
el.clearButton.addEventListener("click", clearAll);

window.addEventListener("resize", fitAllPreviewNames);
updateReadyState();
