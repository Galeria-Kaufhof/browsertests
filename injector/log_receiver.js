/* eslint-env node */

var express = require('express');
var bodyParser = require('body-parser');

module.exports = function (options) {
  var res = express.Router();

  res.use(bodyParser.text({ type: 'text/html', limit: '50mb' }));
  res.use(bodyParser.json());

  res.post('/log', function (request, response) {
    var msg = request.body;
    msg.serverDate = new Date().toISOString();
    options.eventEmitter.emit('log', msg);
    options.eventEmitter.emit(msg.state, msg);
    response.send("ok");
  });

  return res;

};