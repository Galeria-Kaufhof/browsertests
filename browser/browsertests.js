/* globals define, window, jQuery */

define('browsertests', ['browsertests-base', 'browsertests-frame', 'q', 'jquery'], function (base, frame, Q) {

  // ***** Navigation methods

  function waitFor(ms) {
    return new Q.Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(jQuery('#frame').contents());
      }, ms);
      setTimeout(function () {
        reject('`waitFor` timed out after ' + base.waitForTimeout / 1000 + ' seconds');
      }, base.waitForTimeout);
    });
  }

  function waitForDOMContentLoaded(options) {
    options = options || {};
    return new Q.Promise(function (resolve, reject) {
      var guardTimeout = setTimeout(function () {
        reject('No DOMContentLoaded event for ' + base.waitForTimeout / 1000 + ' seconds');
      }, options.timeout || base.waitForTimeout);
      jQuery('#frame').on('load', function () {
        jQuery('#frame').off('load');
        jQuery('#frame').contents().ready(function () {
          window.clearTimeout(guardTimeout);
          resolve(jQuery('#frame').contents());
        });
      });
    });
  }

  function execute(fn, options) {
    options = options || {};

    if (options.retry) {
      options.retryInterval = options.retryInterval || 500;
      options.retries = (options.timeout || base.waitForTimeout) / options.retryInterval;
    }

    var guardedFn = function (resolve, reject) {
      var timeout = options.timeout || base.waitForTimeout;
      var guardTimeout = setTimeout(function () {
        reject('Function did not return for ' + timeout / 1000 + ' seconds');
      }, timeout);
      fn();
      window.clearTimeout(guardTimeout);
      resolve(jQuery('#frame').contents());
    };

    if (options.retries) {
      return new Q.Promise(function (resolve, reject) {

        var tryFn = function (ret) {
          new Q.Promise(guardedFn).then(resolve).catch(function (e) {
            if (ret === 0) {
              reject('Giving up after ' + options.retries + ' retries: ' + e);
            } else {
              setTimeout(function () {
                tryFn(ret - 1);
              }, options.retryInterval);
            }
          });
        };
        tryFn(options.retries);
      });
    }
    else {
      return new Q.Promise(guardedFn);
    }
  }

  //** Convenience

  function open(url) {
    return execute(function () {
      jQuery('#frame').attr('src', url);
    }).then(waitForDOMContentLoaded);
  }

  function assert(bool, message) {
    if (!bool) {
      throw new Error(message || 'Expected "' + bool + '" to be true');
    }
    return true;
  }

  return {
    checkpoint: frame.setCheckpoint,
    waitFor: waitFor,
    waitForDOMContentLoaded: waitForDOMContentLoaded,
    execute: execute,
    open: open,
    assert: assert,
  };

});
