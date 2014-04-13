// U = require('userController');
/**
 * Rest API Adapter for Titanium Alloy
 * @author Mads Møller
 * @version 1.1.3
 * Copyright Napp ApS
 * www.napp.dk
 */


function apiCall(_options, _callback) {

    if ( ! Ti.Network.online) {
          _callback({
            success : false,
            status : "offline",
            responseText : null
        });
    }

    var xhr = Ti.Network.createHTTPClient({
        timeout : _options.timeout || 7000
    });

    //Prepare the request
    xhr.open(_options.type, _options.url);

    xhr.onload = function() {
        var responseJSON, success = true, error;

        try {
            responseJSON = JSON.parse(xhr.responseText);
        } catch (e) {
            Ti.API.error('[REST API] apiCall ERROR: ' + e.message);
            success = false;
            error = e.message;
        }

        _callback({
            success : success,
            status : success ? (xhr.status == 200 ? "ok" : xhr.status) : 'error',
            code : xhr.status,
            data : error,
            responseText : xhr.responseText || null,
            responseJSON : responseJSON || null
        });
    };

    //Handle error
    xhr.onerror = function(e) {
        var responseJSON;

        try {
            responseJSON = JSON.parse(xhr.responseText);
        } catch (e) {
        }

        _callback({
            success : false,
            status : "error",
            code : xhr.status,
            data : e.error,
            responseText : xhr.responseText,
            responseJSON : responseJSON || null
        });
        Ti.API.error('[REST API] apiCall ERROR: ' + xhr.responseText);
        Ti.API.error('[REST API] apiCall ERROR CODE: ' + xhr.status);
    };

    // headers
    // if( U.getUser() && U.getUser().get('accessToken') ){
    //     _options.headers['Access-Token'] = U.getUser().get('accessToken');
    // }

    for (var header in _options.headers) {
        xhr.setRequestHeader(header, _options.headers[header]);
    }

    if (_options.beforeSend) {
        _options.beforeSend(xhr);
    }

    Ti.API.error(_options.type , ' ' , ( _options.url.substring(0, _options.url.indexOf('?')) || _options.url ) +  "?" + toQueryString(_options.urlparams), " | ", toQueryString(_options.headers));


    xhr.send(_options.data || null);

}

function Sync(method, model, opts) {
    var DEBUG = model.config.debug;

    // REST - CRUD
    var methodMap = {
        'create' : 'POST',
        'read' : 'GET',
        'update' : 'PUT',
        'delete' : 'DELETE'
    };

    var type = methodMap[method];
    var params = _.extend({}, opts);
    params.type = type;

    //set default headers
    params.headers = params.headers || {};

    // Send our own custom headers
    if (model.config.hasOwnProperty("headers")) {
        for (var header in model.config.headers) {
            params.headers[header] = model.config.headers[header];
        }
    }

    // We need to ensure that we have a base url.
    if (!params.url) {
        params.url = (model.config.URL || model.url());
        if (!params.url) {
            Ti.API.error("[REST API] ERROR: NO BASE URL");
            return;
        }
    }

        params.urlparams = params.urlparams || {};
        // Add in the params from the model, either from a function or literal
        if ( typeof model.config.URLPARAMS === 'function' ) {
            _.extend(params.urlparams, model.config.URLPARAMS());
        }
        else if ( typeof model.config.URLPARAMS != 'undefined' ) {
            _.extend(params.urlparams, model.config.URLPARAMS);
        }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (Alloy.Backbone.emulateJSON) {
        params.contentType = 'application/x-www-form-urlencoded';
        params.processData = true;
        params.data = params.data ? {
            model : params.data
        } : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (Alloy.Backbone.emulateHTTP) {
        if (type === 'PUT' || type === 'DELETE') {
            if (Alloy.Backbone.emulateJSON)
                params.data._method = type;
            params.type = 'POST';
            params.beforeSend = function(xhr) {
                params.headers['X-HTTP-Method-Override'] = type;
            };
        }
    }

    //json data transfers
    params.headers['Content-Type'] = 'application/json';

    logger(DEBUG, "REST METHOD", method);

    switch(method) {
        case 'create' :
            // convert to string for API call
            params.data = JSON.stringify(model.toJSON());
            logger(DEBUG, "create options", params);

            apiCall(params, function(_response) {
                if (_response.success) {

                    params.success(_response.responseJSON);
                    model.trigger("fetch");
                    // fire event
                } else {
                    params.error(_response.responseJSON, _response.responseText);
                    Ti.API.error('[REST API] CREATE ERROR: ');
                    Ti.API.error(_response);
                }
            });
            break;

        case 'read':

            if( params.id ){
                params.url = params.url + '/' + params.id;
            } else {
                params.url = params.url + '/' + model.get(model.idAttribute);
            }

            if (params.urlparams) {// build url with parameters
                params.url = encodeData(params.urlparams, params.url);
            }

            logger(DEBUG, "read options", params);

            apiCall(params, function(_response) {

                // FIXING AREA //

                if (_response.success && _response.responseJSON) {
                    var resp = _response.responseJSON;
                    var success = params.success;
                    var options = params;

                    if( _.isArray(resp) ){
                        var method = params.reset ? 'reset' : 'set';
                        collection[method](resp, options);
                        if (success) success(collection, resp, options);
                        collection.trigger('sync', collection, resp, options);
                    }

                    if( _.isObject(resp) ){
                        if (!model.set(model.parse(resp, options), options)) return false;
                        if (success) success(model, resp, options);
                        model.trigger('sync', model, resp, options);
                    }

                    model.trigger("fetch");

                } else {
                    params.error && params.error(model, _response);
                    Ti.API.error('[REST API] READ ERROR: ');
                    Ti.API.error(_response.responseText);
                }
            });
            break;

        case 'update' :
            // setup the url & data
            if (_.indexOf(params.url, "?") == -1) {
                params.url = params.url + '/' + model.get(model.idAttribute);
            } else {
                var str = params.url.split("?");
                params.url = str[0] + '/' + model.get(model.idAttribute) + "?" + str[1];
            }

            if (params.urlparams) {
                params.url = encodeData(params.urlparams, params.url);
            }

            params.data = JSON.stringify(model.toJSON());

            logger(DEBUG, "update options", params);

            apiCall(params, function(_response) {
                if (_response.success) {
                    var data = parseJSON(DEBUG, _response);
                    params.success(data, JSON.stringify(data));
                    model.trigger("fetch");
                } else {
                    params.error(model, _response.responseText);
                    Ti.API.error('[REST API] UPDATE ERROR: ');
                    Ti.API.error(_response);
                }
            });
            break;

        case 'delete' :
            if( params.id ){
                params.url = params.url + '/' + params.id;
            } else {
                params.url = params.url + '/' + model.get(model.idAttribute);
            }

            Ti.API.warn(params);

            apiCall(params, function(_response) {

                if ( _response.success ) {
                    var resp = _response.responseJSON;
                    var success = params.success;
                    var options = params;

                    success(model, resp);
                    model.trigger("destroy", model, model.collection, options);

                } else {
                    params.error(model, _response);
                    Ti.API.error('[REST API] DELETE ERROR: ');
                    Ti.API.error(_response);
                }

            });
            break;
    }

}

/////////////////////////////////////////////
// HELPERS
/////////////////////////////////////////////

function logger(DEBUG, message, data) {
    if (DEBUG) {
        Ti.API.debug("[REST API] " + message);
        Ti.API.debug(typeof data === 'object' ? JSON.stringify(data, null, '\t') : data);
    }
}



function encodeData(obj, url) {
    var str = [];
    for (var p in obj) {
        str.push(Ti.Network.encodeURIComponent(p) + "=" + Ti.Network.encodeURIComponent(obj[p]));
    }

    if (_.indexOf(url, "?") == -1) {
        return url + "?" + str.join("&");
    } else {
        return url + "&" + str.join("&");
    }
}


module.exports.sync = Sync;

// module.exports.beforeModelCreate = function(config, name) {
//     config = config || {};
//     return config;
// };

// module.exports.afterModelCreate = function(Model, name) {
//     Model = Model || {};
//     Model.prototype.config.Model = Model;
//     return Model;
// };

function toQueryString(data) {
    var query = [],
        queryString = '',
        key;

    if (data) {
        for (key in data) {
            if (data.hasOwnProperty(key))
                query.push(key + '=' + data[key]);
        }

        if (query.length)
            queryString = query.join('&');
    }

    return queryString;
}