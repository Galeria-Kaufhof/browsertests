/* eslint-env node */

var gulp = require('gulp'),
  argv = require('yargs').argv;

var browserTester = require('./index.js');

gulp.task('run', [], function () {
  browserTester({
    target: argv.target || 'https://www.galeria-kaufhof.de/',
    examples: true,
    elasticsearchHost: argv.elasticsearchHost
  });
  console.log('Proxy running on port 8181 (http) and 8182 (https).');
});

gulp.task('default', ['run']);