"use strict";

const { ipcRenderer } = require("electron");

ipcRenderer.on("play-sound", (_, filePath) => {
  const audio = new Audio(filePath);
  audio.play().catch(() => {});
});
