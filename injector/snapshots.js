var express = require('express');
var mkdirp = require('mkdirp');
var fs = require('fs');

module.exports = function (options) {
  var dir = options.dir || './shapshots'

  var res = express.Router();

  res.use("/snapshots", express.static(dir));

  res.post('/snapshots', function (request, response) {
    var testRunId = request.query.testrunid,
      state = request.query.state;
    mkdirp(dir, function (err) {
      if (err) {
        console.log("Snapshot error: ", err);
        response.status(500).send(err);
      }
      else {
        var fileName = dir + "/" + testRunId + "." + state + ".html";
        fs.writeFile(fileName, request.body, function (err) {
          if (err) {
            console.log("Snapshot error: ", err);
            response.status(500).send(err);
          }
          var msg = {state: 'snapshot', browserState: state, fileName: fileName,
            test: request.query.test, testRunId: testRunId,
            browserId: request.query.browserid, browserName: request.query.browsername, browserVersion: request.query.browserversion};
          options.eventEmitter.emit('log', msg);
          options.eventEmitter.emit(msg.state, msg);
          response.send("ok");
        });
      };
    });
  });

  return res;
}
