const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");
const path = require("node:path");

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let isQuitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });
}

function getLogoPath() {
  return isDev
    ? path.join(__dirname, "..", "public", "logo.png")
    : path.join(__dirname, "..", "dist-electron", "logo.png");
}

function getLogoImage(size = 32) {
  const image = nativeImage.createFromPath(getLogoPath());
  return image.isEmpty() ? image : image.resize({ width: size, height: size });
}

function showMainWindow() {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function createTray() {
  if (tray) return;
  tray = new Tray(getLogoImage(16));
  tray.setToolTip("Huni");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Huni", click: showMainWindow },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showMainWindow);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Huni",
    icon: getLogoImage(256),
    backgroundColor: "#f5f0ff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    const devUrl =
      process.env.ELECTRON_RENDERER_URL ||
      process.env.VITE_DEV_SERVER_URL ||
      "http://192.168.0.8";
    window.loadURL(devUrl);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist-electron", "index.html"));
  }
}

app.setName("Huni");
if (process.platform === "win32") {
  app.setAppUserModelId("com.huni.messenger");
}

ipcMain.handle("huni:notify-message", (_event, payload = {}) => {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return { shown: false };

  const shouldNotify = window.isMinimized() || !window.isVisible() || !window.isFocused();
  if (!shouldNotify) return { shown: false };
  if (!Notification.isSupported()) return { shown: false };

  const title = String(payload.title || "Huni");
  const body = String(payload.body || "New message");
  const notification = new Notification({
    title,
    body,
    icon: getLogoImage(64),
    silent: false,
  });

  notification.on("click", () => {
    showMainWindow();
    window.webContents.send("huni:notification-click", payload);
  });

  notification.show();
  return { shown: true };
});

if (singleInstanceLock) {
  app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  mainWindow = null;
});

app.on("before-quit", () => {
  isQuitting = true;
});
