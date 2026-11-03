/* eslint-disable */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconPath = path.join(__dirname, 'src-tauri', 'icons', 'icon.png');
const backupPath = path.join(__dirname, 'src-tauri', 'icons', 'icon_backup.png');

if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(iconPath, backupPath);
}

const roundedCorners = Buffer.from(
  '<svg><rect x="0" y="0" width="1024" height="1024" rx="224" ry="224"/></svg>'
);

sharp(backupPath)
  .resize(1024, 1024)
  .composite([{
    input: roundedCorners,
    blend: 'dest-in'
  }])
  .toFile(iconPath)
  .then(() => console.log('Squircle done'))
  .catch(e => console.error(e));
