/* eslint-env node */

var StaticStuff = require('./static.js');
var Snapshots = require('./snapshots.js');
var LogReceiver = require('./log_receiver.js');
var StandardLogger = require('./loggers/standard.js');
var EventEmitter = require("events").EventEmitter;

module.exports = function (options) {
  options.eventEmitter = options.eventEmitter || new EventEmitter();

  return [StaticStuff(options), LogReceiver(options), Snapshots(options), StandardLogger(options)];
};