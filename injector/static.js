/* eslint-env node */

var express = require('express');

module.exports = function (options) {
  var res = express.Router();

  res.use("/", express.static("browser"));
  res.use("/vendor", express.static("node_modules/jquery/dist"));
  res.use("/vendor", express.static("node_modules/q"));
  res.use("/vendor", express.static("node_modules/bowser"));
  res.use("/vendor", express.static("node_modules/requirejs"));
  res.use("/vendor", express.static("node_modules/later"));

  if (options.examples) {
    res.use("/examples", express.static("examples"));
    res.use("/tests.json", express.static("examples/tests.json"));
  }

  return res;
};
