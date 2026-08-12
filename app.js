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

async function exportPdf() {
  if (el.pdfButton.disabled) return;

  const originalText = el.pdfButton.textContent;
  el.pdfButton.disabled = true;
  el.pdfButton.textContent = "PDF生成中…";
  setStatus("PDFを生成しています。", "");

  try {
    await document.fonts.ready;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    // A4: 210 x 297mm
    // 名札: 80 x 45mm
    // 隙間なしで 2列 x 6行 = 12枚
    const badgeW = 80;
    const badgeH = 45;
    const cols = 2;
    const rows = 6;
    const perPage = cols * rows;

    const usedW = cols * badgeW;   // 160mm
    const usedH = rows * badgeH;   // 270mm
    const marginX = (210 - usedW) / 2; // 25mm
    const marginY = (297 - usedH) / 2; // 13.5mm

    for (let i = 0; i < state.names.length; i++) {
      if (i > 0 && i % perPage === 0) {
        pdf.addPage();
      }

      const pageIndex = i % perPage;
      const col = pageIndex % cols;
      const row = Math.floor(pageIndex / cols);

      const badge = createBadge(state.names[i], true);
      el.renderArea.replaceChildren(badge);

      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      fitName(badge.querySelector(".name"), 82, 34);

      const canvas = await html2canvas(badge, {
        backgroundColor: null,
        scale: 1.5,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      // 名札間の隙間は完全に0mm
      const x = marginX + col * badgeW;
      const y = marginY + row * badgeH;

      pdf.addImage(imgData, "JPEG", x, y, badgeW, badgeH, undefined, "FAST");

      // 名札自体には枠線を描かない。
      // ページ余白にはみ出す破線ガイドを後段でまとめて描画する。
    }

    // 各ページに、名札境界から余白へはみ出す裁断用の破線ガイドを描画
    const totalPages = pdf.getNumberOfPages();
    const guideLength = 8; // 名札端から余白側へ伸ばす長さ(mm)

    for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
      pdf.setPage(pageNo);
      pdf.setDrawColor(100);
      pdf.setLineWidth(0.2);
      pdf.setLineDashPattern([1.5, 1.5], 0);

      const left = marginX;
      const right = marginX + usedW;
      const top = marginY;
      const bottom = marginY + usedH;

      // 縦方向の裁断位置（左端・中央境界・右端）
      const verticalCuts = [
        left,
        left + badgeW,
        right
      ];

      verticalCuts.forEach((cutX) => {
        // 上側へはみ出す目印
        pdf.line(cutX, top - guideLength, cutX, top);
        // 下側へはみ出す目印
        pdf.line(cutX, bottom, cutX, bottom + guideLength);
      });

      // 横方向の裁断位置（各行境界）
      for (let r = 0; r <= rows; r++) {
        const cutY = top + r * badgeH;

        // 左側へはみ出す目印
        pdf.line(left - guideLength, cutY, left, cutY);
        // 右側へはみ出す目印
        pdf.line(right, cutY, right + guideLength, cutY);
      }

      // 破線設定を解除
      pdf.setLineDashPattern([], 0);
    }

    el.renderArea.innerHTML = "";
    pdf.save("name-badges-a4.pdf");
    setStatus("PDFを出力しました。名札間は0mmで、余白部分に裁断位置を示す破線ガイドを追加しています。", "success");
  } catch (error) {
    console.error(error);
    setStatus(`PDF生成エラー: ${error.message}`, "error");
  } finally {
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
