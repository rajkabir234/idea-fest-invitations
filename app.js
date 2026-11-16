import { importNames, guestCsv } from "./csv.js";
import { PngArchive } from "./zip.js";

const get = id => document.getElementById(id);
const single = get("single");
const bulk = get("bulk");
const guest = get("name");
const namesField = get("names");
const csv = get("csv");
const pngButton = get("png");
const zipButton = get("zip");
const exportButton = get("export");
const previous = get("previous");
const next = get("next");
const preview = get("poster");
const status = get("status");
const template = new Image();
const batchLimit = 500;

let loaded = false;
let mode = "single";
let activeGuest = 0;
let exporting = false;
let importing = false;
let loadError = false;

const names = () => namesField.value.split(/\r\n|\n|\r/).map(name => name.trim()).filter(Boolean);

function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function draw(canvas, name) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(template, 0, 0, canvas.width, canvas.height);
  if (!name) return;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#0b3b78";
  context.font = '700 56px "Segoe UI", "Nirmala UI", sans-serif';
  const measured = context.measureText(name);
  const fit = Math.min(1, 600 / measured.width);
  context.font = `700 ${56 * fit}px "Segoe UI", "Nirmala UI", sans-serif`;
  const metrics = context.measureText(name);
  const baseline = 194 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  context.fillText(name, 536.5, baseline, 600);
}

function update() {
  const list = names();
  const busy = importing || exporting;
  const current = mode === "bulk" ? list[activeGuest] : guest.value.trim();
  pngButton.disabled = !loaded || !guest.value.trim();
  zipButton.disabled = !loaded || !list.length || busy || list.length > batchLimit;
  exportButton.disabled = !list.length || busy;
  csv.disabled = busy;
  namesField.disabled = busy;
  bulk.setAttribute("aria-busy", String(busy));
  get("count").textContent = list.length === 1 ? "1 guest" : `${list.length} guests`;
  get("pager").hidden = mode !== "bulk" || list.length < 2;
  get("position").textContent = `Guest ${activeGuest + 1} of ${list.length}`;
  previous.disabled = activeGuest === 0;
  next.disabled = activeGuest >= list.length - 1;
  preview.setAttribute("aria-label", current ? `Festival invitation for ${current}` : "Festival invitation preview");
  if (loaded) draw(preview, current);
}

function clearStatus() {
  if (!exporting && !importing) {
    if (loadError) report("The invitation artwork could not load. Reload the page to try again.", true);
    else if (mode === "bulk" && names().length > batchLimit) {
      report(`Enter up to ${batchLimit} guests per ZIP. You can still export the full CSV.`, true);
    } else report("");
  }
}

template.onload = () => {
  loaded = true;
  update();
};
template.onerror = () => {
  loadError = true;
  clearStatus();
};
template.src = new URL("invitation-template.png", document.baseURI).href;

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function fileStem(name) {
  return Array.from(name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/\s+/g, "-"))
    .slice(0, 90).join("") || "guest";
}

function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create PNG.")), "image/png");
  });
}

document.querySelectorAll('[name="mode"]').forEach(radio => {
  radio.addEventListener("change", () => {
    mode = radio.value;
    single.hidden = mode !== "single";
    bulk.hidden = mode !== "bulk";
    clearStatus();
    update();
  });
});

guest.addEventListener("input", () => {
  clearStatus();
  update();
});

single.addEventListener("submit", async event => {
  event.preventDefault();
  const name = guest.value.trim();
  if (!loaded || !name) return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = preview.width;
    canvas.height = preview.height;
    draw(canvas, name);
    download(await encodePng(canvas), `invitation-${fileStem(name)}.png`);
  } catch {
    report("The PNG could not be created. Try downloading again.", true);
  }
});

namesField.addEventListener("input", () => {
  activeGuest = 0;
  clearStatus();
  update();
});

csv.addEventListener("change", async () => {
  const file = csv.files[0];
  if (!file) return;
  importing = true;
  update();
  try {
    const list = importNames(await file.text());
    namesField.value = list.join("\n");
    activeGuest = 0;
    report(list.length > batchLimit
      ? `Imported ${list.length} guests. Enter up to ${batchLimit} guests per ZIP.`
      : `Imported ${list.length} ${list.length === 1 ? "guest" : "guests"}.`, list.length > batchLimit);
  } catch (error) {
    report(error.message, true);
  } finally {
    csv.value = "";
    importing = false;
    update();
  }
});

previous.addEventListener("click", () => {
  activeGuest--;
  update();
});
next.addEventListener("click", () => {
  activeGuest++;
  update();
});

function downloadCsv(list, filename) {
  download(new Blob([guestCsv(list)], { type: "text/csv;charset=utf-8" }), filename);
}

get("sample").addEventListener("click", () => downloadCsv(["Aarya Sharma", "Samir Rai"], "sample-guests.csv"));
exportButton.addEventListener("click", () => downloadCsv(names(), "guest-list.csv"));

zipButton.addEventListener("click", async () => {
  const list = names();
  if (zipButton.disabled) return;
  exporting = true;
  update();
  const archive = new PngArchive();
  const canvas = document.createElement("canvas");
  canvas.width = preview.width;
  canvas.height = preview.height;

  try {
    for (const [index, name] of list.entries()) {
      report(`Creating invitation ${index + 1} of ${list.length}…`);
      draw(canvas, name);
      const number = String(index + 1).padStart(String(list.length).length, "0");
      await archive.add(`${number}-invitation-${fileStem(name)}.png`, await encodePng(canvas));
    }
    download(archive.finish(), "startup-idea-fest-invitations.zip");
    report(`ZIP ready with ${list.length} ${list.length === 1 ? "invitation" : "invitations"}.`);
  } catch {
    report("The ZIP could not be created. Try again with a smaller batch.", true);
  } finally {
    exporting = false;
    update();
  }
});

update();
