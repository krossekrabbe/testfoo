"use strict";
/*
 * No-op HMR runtime
 */
Object.defineProperty(exports, "__esModule", { value: true });
function noop() { }
function hot(module) {
    return function (component) {
        return component;
    };
}
exports.default = {
    register: noop,
    listen: noop,
    hot: hot
};
