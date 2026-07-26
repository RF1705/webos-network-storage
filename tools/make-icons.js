"use strict";

var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

function crc32(buffer) {
  var crc = 0xffffffff;
  for (var i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (var bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  var name = Buffer.from(type, "ascii");
  var length = Buffer.alloc(4);
  var checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}
function insideRoundedSquare(x, y, size, radius) {
  if (x >= radius && x < size - radius) return true;
  if (y >= radius && y < size - radius) return true;
  var cx = x < radius ? radius : size - radius - 1;
  var cy = y < radius ? radius : size - radius - 1;
  var dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}
function makeIcon(size, target) {
  var rows = [];
  var bars = [
    { x: .29, y: .53, w: .11, h: .22, a: .62 },
    { x: .445, y: .30, w: .11, h: .45, a: 1 },
    { x: .60, y: .42, w: .11, h: .33, a: .82 }
  ];
  for (var y = 0; y < size; y += 1) {
    var row = Buffer.alloc(1 + size * 4);
    for (var x = 0; x < size; x += 1) {
      var offset = 1 + x * 4;
      var visible = insideRoundedSquare(x, y, size, Math.round(size * .20));
      var red = 16, green = 35, blue = 61, alpha = visible ? 255 : 0;
      bars.forEach(function (bar) {
        if (x >= size * bar.x && x < size * (bar.x + bar.w) && y >= size * bar.y && y < size * (bar.y + bar.h)) {
          red = Math.round(48 * bar.a + red * (1 - bar.a));
          green = Math.round(213 * bar.a + green * (1 - bar.a));
          blue = Math.round(200 * bar.a + blue * (1 - bar.a));
        }
      });
      row[offset] = red; row[offset + 1] = green; row[offset + 2] = blue; row[offset + 3] = alpha;
    }
    rows.push(row);
  }
  var header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  var png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(target, png);
}

var appDir = path.resolve(__dirname, "../app");
makeIcon(80, path.join(appDir, "icon.png"));
makeIcon(130, path.join(appDir, "largeIcon.png"));
