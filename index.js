"use strict";
/*
 * React hot reload runtime
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.hot = exports.listen = void 0;
// supporting either `react-proxy` or `react-stand-in` aliasing for ES6
var reactProxy = require('react-proxy');
var createProxy = reactProxy.default || reactProxy.createProxy;
var getForceUpdate = require('react-deep-force-update');
var g = global;
var proxies = (g._hmr_proxies_ = g._hmr_proxies_ || {});
var updateTimer = 0;
var updateCallback;
__exportStar(require("./lib/transformer"), exports);
/** Notification that some component was updated */
function listen(cb) {
    if (updateTimer)
        resetTimer();
    updateCallback = cb;
}
exports.listen = listen;
/** Hot update helper */
function hot(module, accept) {
    if (accept) {
        accept(module, proxies);
    }
    else if (module && module.hot) {
        module.hot.accept();
    }
    return function (element) {
        listen(function (forceUpdate) {
            forceUpdate(element);
        });
        return element;
    };
}
exports.hot = hot;
/** Register types to be proxied - name must be unique for the fileName */
function register(type, name, fileName) {
    if (typeof type !== 'function')
        return;
    // enable react components proxying
    patchReact();
    // ensure display name
    if (!type.name && !type.displayName && name !== 'default') {
        type.displayName = name;
    }
    // tag type
    var key = name + '@' + fileName;
    type._proxy_id_ = key;
    // create/update proxy
    var proxy = proxies[key];
    if (proxy) {
        proxy.update(type);
        resetTimer();
    }
}
exports.register = register;
function resetTimer() {
    clearTimeout(updateTimer);
    updateTimer = window.setTimeout(notify, 100);
}
function notify() {
    updateTimer = 0;
    updateCallback && updateCallback(getForceUpdate(require('react')));
}
function patchReact() {
    var React = require('react');
    if (!!React._hmr_createElement)
        return;
    React._hmr_createElement = React.createElement;
    // override createElement to return the proxy
    React.createElement = function () {
        var type = arguments[0];
        if (typeof type === 'function' && type._proxy_id_) {
            var proxy = proxies[type._proxy_id_];
            if (!proxy) {
                proxy = proxies[type._proxy_id_] = createProxy(type);
            }
            var args = Array.prototype.slice.call(arguments, 1);
            args.unshift(proxy.get());
            return React._hmr_createElement.apply(React, args);
        }
        return React._hmr_createElement.apply(React, arguments);
    };
}
