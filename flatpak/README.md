# Watcher for Linux: Packaging & Distribution Guide

Watcher supports native Linux packaging via **Debian Package (`.deb`)**, **AppImage**, and **Flatpak**.

---

## 1. Debian Package (`.deb`)
The `.deb` package is natively built by Tauri and is ideal for Debian, Ubuntu, Linux Mint, Pop!_OS, and derivatives.

### Prerequisites (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build Command:
```bash
npm run build
npx tauri build --bundles deb
```
The output `.deb` package will be created in:
`src-tauri/target/release/bundle/deb/watcher_3.0.32_amd64.deb`

### Installation:
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/watcher_3.0.32_amd64.deb
sudo apt-get install -f # resolve any missing dependencies if needed
```

---

## 2. Universal Flatpak
Flatpak provides a sandboxed, universal Linux distribution package that works across Arch, Fedora, openSUSE, Debian, and Ubuntu.

### Prerequisites:
```bash
sudo apt install flatpak flatpak-builder
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.gnome.Platform//46 org.gnome.Sdk//46
```

### Building Flatpak from Watcher:
1. First build the release binary:
   ```bash
   npm run build
   npx tauri build
   ```
2. Build and install the Flatpak bundle:
   ```bash
   cd flatpak
   flatpak-builder --user --install --force-clean build-dir com.watcher.app.yml
   ```
3. Run Watcher:
   ```bash
   flatpak run com.watcher.app
   ```

---

## 3. GitHub Actions Automated Releases
Watcher includes automated multi-platform builds in `.github/workflows/build.yml`. Whenever changes are pushed to `tauri` or `main`:
- Windows: `.exe` and `.msi` are compiled.
- Linux: `.deb` and `.AppImage` are compiled on Ubuntu 22.04.
All packages are automatically uploaded as downloadable workflow artifacts and attached to draft GitHub releases.
