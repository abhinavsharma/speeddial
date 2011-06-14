Utils = function() {};

Utils.prototype.getDataQuery = function(query, params, select) {
  reportError(query);
  reportError(JSON.stringify(params));
  return spinQuery(PlacesUtils.history.DBConnection, {
    names: select,
    params: params,
    query: query,
  })
}

Utils.prototype.insertData = function(data, table) {
  let flatData = [];
  for ([k,v] in Iterator(data)) {
    flatData.push(k);
  }
  let queryString = "INSERT INTO " + table + "(";
  queryString += flatData.join(',');
  queryString += ") VALUES ("
  queryString += flatData.map(function(d) {return ":" + d + "_v";}).join(',');
  queryString += ");";
  //reportError(queryString);
  let params = {};
  for ([k,v] in Iterator(data)) {
    params[k + "_v"] = v;
  }
  //reportError(JSON.stringify(stm.params));
  spinQuery(PlacesUtils.history.DBConnection, {
    params: params,
    query: queryString,
  });
};


Utils.prototype.createDB = function() {
  let me = this;
  let result = me.getDataQuery("SELECT id FROM moz_anno_attributes WHERE name = :name", {
    "name" : "labmonkey/thumbnail",
  }, ["id"]);
  if (result.length > 0) {
    return result[0]["id"];
  }

  me.insertData({
    "name": "labmonkey/thumbnail",
  }, "moz_anno_attributes");
  
  me.getDataQuery("SELECT id FROM moz_anno_attributes WHERE name = :name", {
    "name" : "labmonkey/thumbnail",
  }, ["id"])
  if (result.length > 0) {
    return result[0]["id"];
  } else {
    return null;
  }

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
  canvas.setAttribute('width', '120');
  canvas.setAttribute('height', '100');
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

Utils.prototype.AsyncQuery = function(query, params, callback) {
  if (!query) {
    return;
  }
  
  let db = PlacesUtils.history.DBConnection;
  let stmt = db.createStatement(query);
  if (aItem.params) {
    for (let [name, value] in Iterator(params)) {
      stmt.params[name] = value;
    }
  }
  stmt.executeAsync({
    handleResult: callback,
    handleError: function (error) { reportError(ex) },
    handleCompletion: function() {},
  });
}
