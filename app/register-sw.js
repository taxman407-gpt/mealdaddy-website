if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // Installation is an enhancement; the app remains usable without it.
  });
}

