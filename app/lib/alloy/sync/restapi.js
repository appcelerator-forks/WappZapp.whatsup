var Sync, apiCall, encodeData, logger, toQueryString;

apiCall = function(_options, _callback) {
  var k, v, xhr, _ref, _ref1, _ref2;
  if (!Ti.Network.online) {
    _callback({
      success: false,
      status: "offline",
      responseText: null
    });
  }
  xhr = Ti.Network.createHTTPClient({
    timeout: (_ref = _options.timeout) != null ? _ref : 7000
  });
  xhr.open(_options.type, _options.url);
  xhr.onload = function() {
    var e, error, responseJSON, success, _ref1;
    responseJSON = "";
    success = true;
    error = null;
    try {
      responseJSON = JSON.parse(xhr.responseText);
    } catch (_error) {
      e = _error;
      Ti.API.error('[REST API] apiCall ERROR: ' + e.message);
      success = false;
      error = e.message;
    }
    return _callback({
      success: success,
      status: success ? (xhr.status === 200 ? "ok" : xhr.status) : 'error',
      code: xhr.status,
      data: error,
      responseText: (_ref1 = xhr.responseText) != null ? _ref1 : null,
      responseJSON: responseJSON != null ? responseJSON : null
    });
  };
  xhr.onerror = function(e) {
    var responseJSON;
    responseJSON = "";
    try {
      responseJSON = JSON.parse(xhr.responseText);
    } catch (_error) {
      e = _error;
    }
    _callback({
      success: false,
      status: "error",
      code: xhr.status,
      data: e.error,
      responseText: xhr.responseText,
      responseJSON: responseJSON || null
    });
    Ti.API.error('[REST API] ' + xhr.status);
    return Ti.API.error(xhr.responseText);
  };
  _ref1 = _options.headers;
  for (k in _ref1) {
    v = _ref1[k];
    xhr.setRequestHeader(k, v);
  }
  if (typeof _options.beforeSend === "function") {
    _options.beforeSend(xhr);
  }
  Ti.API.warn("" + _options.type + " " + (_options.url.substring(0, _options.url.indexOf('?')) || _options.url) + "?" + (toQueryString(_options.urlparams)));
  delete _options.headers['Content-Type'];
  Ti.API.info("HEADERS " + (toQueryString(_options.headers)));
  return xhr.send((_ref2 = _options.data) != null ? _ref2 : null);
};

Sync = function(method, model, opts) {
  var DEBUG, header, methodMap, params, str, type, _ref, _ref1, _ref2;
  DEBUG = model.config.debug;
  methodMap = {
    'create': 'POST',
    'read': 'GET',
    'update': 'PUT',
    'delete': 'DELETE'
  };
  type = methodMap[method];
  params = _.extend({}, opts);
  params.type = type;
  params.headers = (_ref = params.headers) != null ? _ref : {};
  if (model.config.hasOwnProperty("headers")) {
    for (header in model.config.headers) {
      params.headers[header] = model.config.headers[header];
    }
  }
  if (!params.url) {
    params.url = (_ref1 = model.config.URL) != null ? _ref1 : model.url();
    if (!params.url) {
      return Ti.API.error("[REST API] ERROR: NO BASE URL");
    }
    params.urlparams = (_ref2 = params.urlparams) != null ? _ref2 : {};
    if (typeof model.config.URLPARAMS === 'function') {
      _.extend(params.urlparams, model.config.URLPARAMS());
    } else if (model.config.URLPARAMS !== void 0) {
      _.extend(params.urlparams, model.config.URLPARAMS);
    }
  }
  if (Alloy.Backbone.emulateJSON) {
    params.contentType = 'application/x-www-form-urlencoded';
    params.processData = true;
    params.data = params.data ? {
      model: params.data
    } : {};
  }
  if (Alloy.Backbone.emulateHTTP) {
    if (type === 'PUT' || type === 'DELETE') {
      if (Alloy.Backbone.emulateJSON) {
        params.data._method = type;
      }
      params.type = 'POST';
      params.beforeSend = function(xhr) {
        return params.headers['X-HTTP-Method-Override'] = type;
      };
    }
  }
  params.headers['Content-Type'] = 'application/json';
  switch (method) {
    case 'create':
      params.data = JSON.stringify(model.toJSON());
      return apiCall(params, function(_response) {
        if (_response.success) {
          params.success(_response.responseJSON);
          return model.trigger("fetch");
        } else {
          params.error(_response.responseJSON, _response.responseText);
          Ti.API.error('[REST API] CREATE ERROR: ');
          return Ti.API.error(_response);
        }
      });
    case 'read':
      if (params.id != null) {
        params.url = params.url + '/' + params.id;
      } else {
        params.url = params.url + '/' + model.get(model.idAttribute);
      }
      if (params.urlparams) {
        params.url = encodeData(params.urlparams, params.url);
      }
      logger(DEBUG, "read options", params);
      return apiCall(params, function(_response) {
        var options, resp, success;
        if (_response.success && _response.responseJSON) {
          resp = _response.responseJSON;
          success = params.success;
          options = params;
          if (_.isArray(resp)) {
            if (typeof success === "function") {
              success(resp, options);
            }
            model.trigger('sync', model, resp, options);
          } else if (_.isObject(resp)) {
            if (!model.set(model.parse(resp, options), options)) {
              return false;
            }
            if (typeof success === "function") {
              success(model, resp, options);
            }
            model.trigger('sync', model, resp, options);
          }
          return model.trigger("fetch");
        } else {
          if (typeof params.error === "function") {
            params.error(_response);
          }
          Ti.API.error('[REST API] READ ERROR: ');
          return Ti.API.error(_response.responseText);
        }
      });
    case 'update':
      if (_.indexOf(params.url, "?") === -1) {
        params.url = params.url + '/' + model.get(model.idAttribute);
      } else {
        str = params.url.split("?");
        params.url = str[0] + '/' + model.get(model.idAttribute) + "?" + str[1];
      }
      if (params.urlparams) {
        params.url = encodeData(params.urlparams, params.url);
      }
      params.data = JSON.stringify(model.toJSON());
      logger(DEBUG, "update options", params);
      return apiCall(params, function(_response) {
        var data;
        if (_response.success) {
          data = parseJSON(DEBUG, _response);
          params.success(data, JSON.stringify(data));
          return model.trigger("fetch");
        } else {
          params.error(model, _response.responseText);
          Ti.API.error('[REST API] UPDATE ERROR: ');
          return Ti.API.error(_response);
        }
      });
    case 'delete':
      if (params.id != null) {
        params.url = params.url + '/' + params.id;
      } else {
        params.url = params.url + '/' + model.get(model.idAttribute);
      }
      return apiCall(params, function(_response) {
        var options, resp, success;
        if (_response.success) {
          resp = _response.responseJSON;
          success = params.success;
          options = params;
          if (typeof success === "function") {
            success(model, resp);
          }
          return model.trigger("destroy", model, model.collection, options);
        } else {
          params.error(model, _response);
          Ti.API.error('[REST API] DELETE ERROR: ');
          return Ti.API.error(_response);
        }
      });
  }
};

logger = function(DEBUG, message, data) {
  if (!DEBUG) {
    return;
  }
  return Ti.API.debug("[REST API] " + message);
};

encodeData = function(obj, url) {
  var p, str;
  str = [];
  for (p in obj) {
    str.push(Ti.Network.encodeURIComponent(p) + "=" + Ti.Network.encodeURIComponent(obj[p]));
  }
  if (url.indexOf("?") === -1) {
    return url + "?" + str.join("&");
  } else {
    return url + "&" + str.join("&");
  }
};

module.exports.sync = Sync;

toQueryString = function(data) {
  var key, query, queryString;
  if (!data) {
    return "";
  }
  query = [];
  queryString = '';
  key = null;
  for (key in data) {
    if (data.hasOwnProperty(key)) {
      query.push(key + '=' + data[key]);
    }
  }
  if (query.length) {
    queryString = query.join('&');
  }
  return queryString;
};
