const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("huniDesktop", {
  platform: process.platform,
  notifyMessage(payload) {
    return ipcRenderer.invoke("huni:notify-message", payload);
  },
  onNotificationClick(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("huni:notification-click", listener);
    return () => ipcRenderer.removeListener("huni:notification-click", listener);
  },
});
