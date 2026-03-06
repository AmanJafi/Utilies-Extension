# <img src="icons/icon-48.png" width="32" height="32" valign="middle"> Nightfall – Dark Mode for Safari & Chrome

A professional, high-performance dark mode extension designed for power users. Nightfall provides a beautiful dark aesthetic for any website, paired with Neovim-style keyboard navigation and a persistent, automated clipboard.

---

## <img src="icons/icon-48.png" width="24" height="24" valign="middle"> Features

### 🏢 Intelligent Dark Mode
- **Global & Per-Site Control**: Toggle dark mode globally or customize it for specific domains.
- **Element Picker**: Precision control—selectively toggle dark mode for any element on a page if it was missed by the automatic engine.
- **Premium Aesthetics**: A custom-designed, sleek dark UI with a professional crescent moon logo.

### ⌨️ Vim Navigation
- **Modal Editing**: Supports **Normal** and **Insert** modes. Standard typing works in Insert mode; powerful navigation works in Normal mode.
- **Flexible Scrolling**: Use `h`, `j`, `k`, `l` for precision scrolling and `gg`/`G` for top/bottom navigation.
- **Page Controls**: `dd` for Page Down and `u` for Page Up by default.
- **Fully Customizable**: Add, remove, or remap any keybind to any action via the **Preferences** page.

### 📋 Persistent Clipboard
- **Auto-Capture**: Copies any selected text or images automatically to your local extension storage.
- **Context Menu Integration**: Right-click any image and select **"Save Image to Nightfall Clipboard"** to bypass CORS and save it permanently.
- **Image Support**: Stores full data-URLs for images, ensuring they persist even after sessions end.
- **History Management**: Keep up to 50 items with quick-copy back to your system clipboard.

---

## 🚀 Installation

### For Safari (macOS)
1.  Ensure you have **Xcode** installed from the App Store.
2.  Open **Terminal** and navigate to this project folder.
3.  Run `xcrun safari-web-extension-converter .` (Note: This converts the project into a Safari app extension project).
4.  Open the resulting `.xcodeproj` file in Xcode.
5.  In Xcode, select **Product > Build**.
6.  Open **Safari**, go to **Settings > Extensions**, and check the box for **Nightfall**.
    *   *Note: If "Allow Unsigned Extensions" is not enabled, you may need to enable it in Safari's Develop menu.*

### For Google Chrome / Brave / Edge
1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer mode** in the top right corner.
3.  Click **Load unpacked**.
4.  Select the root folder of this project (`DarkMode`).
5.  Pin the Nightfall icon to your toolbar for easy access!

---

## 🛠 Usage & Shortcuts

### Default Normal Mode Keys
| Key | Action |
|-----|--------|
| `j` | Scroll Down |
| `k` | Scroll Up |
| `h` | Scroll Left |
| `l` | Scroll Right |
| `gg` | Scroll to Top |
| `G` | Scroll to Bottom |
| `dd` | Page Down |
| `u` | Page Up / Undo |
| `i` | Enter Insert Mode |
| `a` | Enter Append Mode |
| `Esc` | Return to Normal Mode |

### Customizing Keybinds
1.  Open the Nightfall popup.
2.  Go to the **Vim Keybinds** tab.
3.  Click **Customize Keybinds**.
4.  Add or remap keys as you see fit!

---

## 🎨 Icon Aesthetic
Nightfall uses a **Pure Black (#000000)** square icon with a **Solid White Crescent Moon**. No rounded corners, no gradients—just a sharp, minimalist logo that looks stunning in any menu bar.

---

*Enjoy the dark side.* <img src="icons/icon-48.png" width="16" height="16" valign="middle">
