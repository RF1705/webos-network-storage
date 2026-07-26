"use strict";

var fs = require("fs");
var path = require("path");
var Package = require("@webos-tools/cli/lib/package");

var inputDirectories = process.argv.slice(2, -1);
var outputDirectory = process.argv[process.argv.length - 1];

if (inputDirectories.length === 0 || !outputDirectory) {
  console.error("Usage: node tools/package-ipk.js <app> [service ...] <output>");
  process.exit(2);
}

outputDirectory = path.resolve(outputDirectory);
fs.mkdirSync(outputDirectory, { recursive: true });

var packager = new Package.Packager();

// The application itself is HTML, but its service contains an ARMv7 ELF
// executable. The stock JavaScript ares-package only inspects appinfo.main
// and would therefore incorrectly label the complete IPK as "all".
packager.architecture = "arm";

packager.generatePackage(
  inputDirectories,
  outputDirectory,
  {},
  function (message) {
    console.log(message);
  },
  function (error, result) {
    if (error) {
      if (Array.isArray(error)) {
        error.forEach(function (item) {
          console.error(item.message || String(item));
        });
      } else {
        console.error(error.stack || String(error));
      }
      process.exitCode = 1;
      return;
    }

    console.log(result && result.ipk ? result.ipk : "IPK created.");
  }
);
