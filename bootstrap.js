const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");


function getThumbnail(win, doc) {
  let canvas = doc.createElement("canvas"); // where?
  canvas.setAttribute('width', '90');
  canvas.setAttribute('height', '70');
  let aspectRatio = canvas.width / canvas.height;
  let w = win.innerWidth + win.scrollMaxX;
  let h = Math.max(win.innerHeight, w / aspectRatio);
  if (w > 10000) {
    w = 10000;
  }
  if (h > 10000) {
    h = 10000;
  }

    let canvasW = canvas.width;
    let canvasH = canvas.height;
    let ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();

    let scale = canvasH / h;
    ctx.scale(scale, scale);
  ctx.drawWindow(win, 0, 0, w, h, "rgb(255,255,255)");
  ctx.restore();
  let img = canvas.toDataURL("image/png", "");
  return img;
}

function setupListener(window) {
  let tabs = window.gBrowser.visibleTabs;
  for (let i = 0; i <  tabs.length; i++) {
    let tab = tabs[i];
    let doc = tab.linkedBrowser.contentDocument;
    let win = tab.linkedBrowser.contentWindow;
    let img = getThumbnail(win, doc);
    Cu.reportError(img);
  }
}


function startup(data, reason) {
  
  let callback = setupListener;

  function watcher(window) {
    try {
      callback(window);
    }
    catch(ex) {}
  }

  function runOnLoad(window) {
    window.addEventListener("load", function() {
      window.removeEventListener("load", arguments.callee, false);
      let doc = window.document.documentElement;
      if (doc.getAttribute("windowtype") == "navigator:browser")
        watcher(window);
    }, false);
  }


  let browserWindows = Services.wm.getEnumerator("navigator:browser");
  while (browserWindows.hasMoreElements()) {
    let browserWindow = browserWindows.getNext();
    if (browserWindow.document.readyState == "complete") {
      watcher(browserWindow);
    } else {
      runOnLoad(browserWindow);
    }
  }
}

function shutdown() {}

function install() {}

function uninstall() {}
