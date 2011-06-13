const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;

Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const DEBUG = true;
const global = this;
reportError = DEBUG ? Cu.reportError : function() {};

SCRIPTS = ["utils"];


/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}



function spinQuery(connection, {names, params, query}) {
  // Initialize the observer to watch for application quits during a query
  if (spinQuery.checkReady == null) {
    // In the common case, return true to continue execution
    spinQuery.checkReady = function() true;

    // Change the checkReady function to throw to abort
    let abort = function(reason) {
      spinQuery.checkReady = function() {
        throw reason;
      };
    };

    // Add the observer and make sure to clean up
    let onQuit = function() abort("Application Quitting");
    Services.obs.addObserver(onQuit, "quit-application", false);
    unload(function() Services.obs.removeObserver(onQuit, "quit-application"));

    // Also watch for unloads to stop queries
    unload(function() abort("Add-on Unloading"));
  }

  // Remember the results from processing the query
  let allResults = [];
  let status;

  // Nothing to do with no query
  if (query == null)
    return allResults;

  // Create the statement and add parameters if necessary
  let statement = connection.createAsyncStatement(query);
  if (params != null) {
    Object.keys(params).forEach(function(key) {
      statement.params[key] = params[key];
    });
  }

  // Start the query and prepare to cancel if necessary
  let pending = statement.executeAsync({
    // Remember that we finished successfully
    handleCompletion: function handleCompletion(reason) {
      if (reason != Ci.mozIStorageStatementCallback.REASON_ERROR)
        status = allResults;
    },

    // Remember that we finished with an error
    handleError: function handleError(error) {
      status = error;
    },

    // Process the batch of results and save them for later
    handleResult: function handleResult(results) {
      let row;
      while ((row = results.getNextRow()) != null) {
        let item = {};
        names.forEach(function(name) {
          item[name] = row.getResultByName(name);
        });
        allResults.push(item);
      }
    },
  });

  // Grab the current thread so we can make it give up priority
  let thread = Cc["@mozilla.org/thread-manager;1"].getService().currentThread;

  // Keep waiting until the query finished unless aborting
  try {
    while (spinQuery.checkReady() && status == null)
      thread.processNextEvent(true);
  }
  // Must be aborting, so cancel the query
  catch(ex) {
    pending.cancel();
    status = ex;
  }

  // Must have completed with an error so expose it
  if (status != allResults)
    throw status;

  return allResults;
}



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

/*
function setupListener(window) {
  let tabs = window.gBrowser.visibleTabs;
  let utils = new Utils();
  for (let i = 0; i <  tabs.length; i++) {
    let tab = tabs[i];
    let doc = tab.linkedBrowser.contentDocument;
    let win = tab.linkedBrowser.contentWindow;


    let img = getThumbnail(win, doc);
    let url = window.gBrowser.getBrowserForTab(tab).currentURI.spec;
    let placeId = utils.getDataQuery(
      "SELECT id FROM moz_places WHERE url = :url",
      { "url" : url }, ["id"])[0]["id"];
    Cu.reportError(placeId);
    Cu.reportError(url);
    Cu.reportError(img);
    let annoID = createDB();
    utils.insertData({
      "anno_attribute_id" : annoID,
      "content": img,
      "place_id" : placeId,
    }, "moz_annos");
  }
}
*/

function setupListener(window) {
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }
    
  change(window.gBrowser, "loadOneTab", function(orig) {
    return function(url) {
      let tab = orig.apply(this, arguments);
      let doc = tab.linkedBrowser.contentDocument;
      let win = tab.linkedBrowser.contentWindow;
      win.addEventListener("load", function() {
        win.removeEventListener("load", arguments.callee, true);
        win.gBrowser.addEventListener("load", function(event) {
          win.gBrowser.removeEventListener("load", arguments.callee, true);
          let w = event.originalTarger.defaultView;
          reportError("widnow load event");
        }, true);
      }, true)
      return tab;
    };
  });
}



function startup(data, reason) {

  AddonManager.getAddonByID(data.id, function(addon) {
    /* import scripts */
    SCRIPTS.forEach(function(fileName) {
      let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
      Services.scriptloader.loadSubScript(fileURI.spec, global);
    });
    
    let annoID = createDB();

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
  });

  
}

function createDB() {
  let utils = new Utils();
  let result = utils.getDataQuery("SELECT id FROM moz_anno_attributes WHERE name = :name", {
    "name" : "labmonkey/thumbnail",
  }, ["id"]);
  if (result.length > 0) {
    return result[0]["id"];
  }

  utils.insertData({
    "name": "labmonkey/thumbnail",
  }, "moz_anno_attributes");
  
  utils.getDataQuery("SELECT id FROM moz_anno_attributes WHERE name = :name", {
    "name" : "labmonkey/thumbnail",
  }, ["id"])
  if (result.length > 0) {
    return result[0]["id"];
  } else {
    return null;
  }

}

function shutdown() {}

function install(data, reason) {
  AddonManager.getAddonByID(data.id, function(addon) {
    SCRIPTS.forEach(function(fileName) {
      let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
      Services.scriptloader.loadSubScript(fileURI.spec, global);
    });
    createDB();
  });
}

function uninstall() {}
