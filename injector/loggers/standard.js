var express = require('express');
var moment = require('moment');

module.exports = function (options) {
  var log = [];

  var res = express.Router();

  options.eventEmitter.on('log', function(msg) {
    console.log("Log: ", msg);
    log.push(msg);
  });

  res.get("/log", function (request, response) {
    response.render(__dirname + "/views/log.jade", { log: log, moment: moment });
  });

  res.delete('/log', function (request, response) {
    log = [];
    options.eventEmitter.emit('log_purged');
    response.redirect("log");
  });

  res.post('/log/delete', function (request, response) {
    log = [];
    options.eventEmitter.emit('log_purged');
    response.redirect("../log");
  });

  return res;
}
