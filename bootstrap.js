/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Restartless.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <asharma@mozilla.com>
 *   Edward Lee <edilee@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const DEBUG = true;
const reportError = DEBUG ? Cu.reportError : function() {};
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const SCRIPTS = ["utils", "dial"];
const global = this;


/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
function watchWindows(callback) {
  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      callback(window);
    }
    catch(ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener("load", function() {
      window.removeEventListener("load", arguments.callee, false);

      // Now that the window has loaded, only handle browser windows
      let doc = window.document.documentElement;
      if (doc.getAttribute("windowtype") == "navigator:browser")
        watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let browserWindows = Services.wm.getEnumerator("navigator:browser");
  while (browserWindows.hasMoreElements()) {
    // Only run the watcher immediately if the browser is completely loaded
    let browserWindow = browserWindows.getNext();
    if (browserWindow.document.readyState == "complete")
      watcher(browserWindow);
    // Wait for the window to load before continuing
    else
      runOnLoad(browserWindow);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == "domwindowopened")
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

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


function getPlaceFromURL(url) {
  let utils = new Utils();
  let result = utils.getDataQuery(
    "SELECT id, frecency FROM moz_places WHERE url = :url", {"url" : url}, ["id","frecency"]);
  if (result.length == 0) {
    return null;
  } else {
    return result[0];
  }
}

function addThumbnail(placeId, img) {
  let utils = new Utils();
  let d = new Date().getTime();
  let existing = utils.getDataQuery(
    "SELECT id, lastModified FROM moz_annos WHERE anno_attribute_id = :annoID AND place_id = :placeId",
    {
      "annoID" : global.annoID,
      "placeId" : placeId,
    }, ["id", "lastModified"]);
  if (existing.length > 0) {
    let oldDate = existing[0].lastModified;
    if ((d - oldDate)/(1000* 60 * 60*24*40) > 1) {
      utils.getDataQuery(
      "UPDATE moz_annos SET content = :content, lastModified = :d WHERE id = :id", {
        "id" : placeId,
        "content" : img,
        "d" : d,
      }, [])
    }
  } else {
    utils.insertData({
      "anno_attribute_id" : annoID,
      "content": img,
      "place_id" : placeId,
      "dateAdded": d,
      "lastModified": d,
    }, "moz_annos");
  }
}

function handlePageLoad(e) {
  reportError("Handling a page load");
  let doc = e.originalTarget;
  let win = doc.defaultView;
  let url = doc.location.href;

  let place = getPlaceFromURL(url);
  if (place && place.frecency && place.frecency > 1000) {
    let thumb = getThumbnail(win, doc);
    try {
    addThumbnail(place.id, thumb);
    } catch (ex) { reportError(ex) }
  }
}

/**
 * Shift the window's main browser content down and right a bit
 */
function shiftBrowser(window) {
  reportError("adding a listener");
  window.addEventListener("DOMContentLoaded", handlePageLoad, true);


  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }
    
  change(window.gBrowser, "loadOneTab", function(orig) {
    return function(url) {
      let tab = orig.apply(this, arguments);
      if (url == "about:blank") {
        let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
        let fileURI = global.aboutURI.spec;
        let tBrowser = gBrowser.getBrowserForTab(tab)
        tBrowser.loadURI(fileURI, null, null);
       
        tab.linkedBrowser.addEventListener("load", function() {
          tab.linkedBrowser.removeEventListener("load", arguments.callee, true);
          Services.wm.getMostRecentWindow("navigator:browser").gURLBar.value = "";
          let doc = tab.linkedBrowser.contentDocument;
          try {
          let dashboard = new SpeedDial(doc, annoID, global.utils);
          } catch (ex) { reportError(ex) };
        }, true);

      }
      return tab;
    };
  });


  // Restore the original position when the add-on is unloaded
  unload(function() {
    window.removeEventListener("DOMContentLoaded", handlePageLoad, true);
  }, window);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data, reason) {
  // Shift all open and new browser windows
  AddonManager.getAddonByID(data.id, function(addon) {
    /* import scripts */
    SCRIPTS.forEach(function(fileName) {
      let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
      Services.scriptloader.loadSubScript(fileURI.spec, global);
    });
    global.utils = global.utils ? global.utils : new Utils();
    global.annoID = global.utils.createDB();
    global.aboutURI = addon.getResourceURI("content/dial.html");
    watchWindows(shiftBrowser);
  });

}

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {
  global.utils = global.utils ? global.utils : new Utils();
  global.aboutURI
  global.utils.createDB();
}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
