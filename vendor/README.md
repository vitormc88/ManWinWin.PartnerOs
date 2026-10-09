# SheetJS Excel reader

`xlsx-0.20.3.tgz` is the official SheetJS CE distribution, downloaded over HTTPS from https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz on 8 October 2026.

SHA256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` (local integrity record).

The vendor recommends local vendoring: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/. Version 0.18.5 on the npm registry is obsolete. The file dependency pins the exact tested archive and avoids remote tarball fetching during deployment. Its Apache-2.0 license is included in the archive.

Update through the official distribution, review the version and archive integrity, regenerate the project's lockfiles and rerun importer/build tests. This directory contains library code only, never customer spreadsheets or data.
