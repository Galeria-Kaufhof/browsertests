/* eslint-env node */

var http = require('http');
var https = require('https');
var express = require('express');
var fs = require('fs');

var Injector = require('./injector');
var Proxy = require('./proxy');

module.exports = function (options) {
  var app = express();

  // Browsertests stuff
  app.use('/browsertests', Injector(options));

  // Proxy
  //app.use('/someOldStuffWithAbsoluteUrisInTheBody', Proxy(options.target, { rewriteBody: ["text/html"] }));
  app.use('/', Proxy(options.target));

  // Server
  http.createServer(app).listen(8181);

  var privateKey = fs.readFileSync('sslcert/server.key.pem', 'utf8');
  var certificate = fs.readFileSync('sslcert/server.cert.pem', 'utf8');
  https.createServer({ key: privateKey, cert: certificate }, app).listen(8182);
};