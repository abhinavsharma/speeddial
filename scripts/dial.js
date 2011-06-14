/**
 * Constructs the speed dial.
 */
function SpeedDial(doc, annoID, utils) {
  let me = this;
  me.utils = utils;
  me.annoID = annoID;
  me.doc = doc;
  me.getData();
}

SpeedDial.prototype.getData = function() {
  let me = this;
  reportError(Object.keys(me.utils));
  me.utils.getDataQuery(
    "SELECT p.title as title, p.url as url, a.content as image " + 
    "FROM moz_places p JOIN moz_annos a ON p.id = a.place_id WHERE " +
    "a.anno_attribute_id = :annoID ORDER BY frecency DESC LIMIT 9", {
    "annoID" : me.annoID,
  }, ["title", "url", "image"]).forEach(function({title, url, image}) {
    me.addElement(title, url, image);
  })
};

SpeedDial.prototype.isValidURL = function(url) {
  if (url && url.indexOf("http") > -1) {
    return true;
  }
  return false;
};


SpeedDial.prototype.addElement = function(title, url, image) {
  let me = this;
  let $ = me.doc.getElementById;

  if (!me.isValidURL(url)) {
    return;
  }

  let thumbContainer = me.doc.createElement('span');
  thumbContainer.setAttribute('class', 'thumb-container');
  
  let imageLink = me.doc.createElement('a');
  imageLink.setAttribute('href', url);
  let thumbnail = me.doc.createElement('img');
  thumbnail.setAttribute('src', image);
  imageLink.appendChild(thumbnail);

  let spanInfo = me.doc.createElement('span');
  spanInfo.setAttribute('class', 'thumb-info');
  let textLink = me.doc.createElement('a');
  textLink.innerHTML = title.length > 20 ? title.slice(0,18) + "..." : title;
  textLink.setAttribute('href', url);
  spanInfo.appendChild(textLink);

  thumbContainer.appendChild(imageLink);
  thumbContainer.appendChild(spanInfo);
  $('frequent').appendChild(thumbContainer);
}
