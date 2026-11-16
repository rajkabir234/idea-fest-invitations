const utf8 = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  for (let bit = 0; bit < 8; bit++) {
    byte = (byte >>> 1) ^ (byte & 1 ? 0xedb88320 : 0);
  }
  return byte;
});

export class PngArchive {
  files = [];
  directory = [];
  offset = 0;
  directorySize = 0;

  async add(filename, png) {
    // PNG data is already compressed, so ZIP stores it as-is.
    const name = utf8.encode(filename);
    const data = new Uint8Array(await png.arrayBuffer());
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(12, 33, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, png.size, true);
    local.setUint32(22, png.size, true);
    local.setUint16(26, name.length, true);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    new Uint8Array(entry.buffer, 6, 26).set(new Uint8Array(local.buffer, 4, 26));
    entry.setUint32(42, this.offset, true);

    this.files.push(local.buffer, name, png);
    this.directory.push(entry.buffer, name);
    this.offset += local.byteLength + name.length + png.size;
    this.directorySize += entry.byteLength + name.length;
  }

  finish() {
    const end = new DataView(new ArrayBuffer(22));
    const count = this.directory.length / 2;
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, count, true);
    end.setUint16(10, count, true);
    end.setUint32(12, this.directorySize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.files, ...this.directory, end.buffer], { type: "application/zip" });
  }
}
