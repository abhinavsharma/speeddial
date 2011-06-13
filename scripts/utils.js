Utils = function() {
  let me = this;


  me.taggingSvc = Cc["@mozilla.org/browser/tagging-service;1"]
                  .getService(Ci.nsITaggingService);
  me.bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
                   .getService(Ci.nsINavBookmarksService);
  me.ios = Cc["@mozilla.org/network/io-service;1"]
           .getService(Ci.nsIIOService);
  me.GET_PLACES_FROM_TAG = {};
  me.GET_PLACE_ID_FROM_URL = {}
};

Utils.prototype.getDataQuery = function(query, params, select) {
  reportError(query);
  reportError(JSON.stringify(params));
  return spinQuery(PlacesUtils.history.DBConnection, {
    names: select,
    params: params,
    query: query,
  })
}

Utils.prototype.getData = function(fields, conditions, table) {
  let me = this;
  let queryString = "SELECT ";
  queryString += fields.join(',') + ' FROM ' + table + ' WHERE ';
  let conditionArr = [];
  for (let key in conditions) {
    conditionArr.push(key + " = :" + key + "_v");
  }
  queryString += conditionArr.join(" AND ");
  //reportError("query string constructed" + queryString);
  //reportError("statement created, parametrizing with " + JSON.stringify(conditions));
  let params = {};
  for ([k, v] in Iterator(conditions)) {
    //reportError("adding condition + " + k + " : " + v);
    params[k + "_v"] = v;
  }
  //reportError("params are" + JSON.stringify(stm.params));
  //reportError("executing statement");
  return spinQuery(PlacesUtils.history.DBConnection, {
    names: fields,
    params: params,
    query: queryString,
  });
  //reportError("returing " + JSON.stringify(ret));
};

Utils.prototype.updateData = function(id, data, table) {
  let queryString = "UPDATE " + table + " SET ";
  for ([k, v] in Iterator(data)) {
    queryString += k + " = :" + k + "_v ";
  }
  queryString += "WHERE id = :id";
  //reportError(queryString);
  let params = {
    id: id,
  }
  for ([k,v] in Iterator(data)) {
    params[k + "_v"] = v;
  }
  spinQuery(PlacesUtils.history.DBConection, {
    params: params,
    query: queryString,
  });
};

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

