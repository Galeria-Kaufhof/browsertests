/* globals define, require, window, later, $ */

if (!window.console) {
  window.console = {log: function() {
      return true;
    }};
}

define("browsertests", ["browsertestsConfig"], function(config) {

  var browserId = (document.cookie.match('(^|; )browserId=([^;]*)') || 0)[2];
  if (!browserId) {
    browserId = generateId();
    document.cookie="browserId=" + browserId + ";path=/browsertests/";
  }

  var browsertests = { // Main object (to be returned at the end)
    browserId: browserId,
    waitForTimeout: config.waitForTimeout || 20000,
    idleTime: config.idleTime || 5000
  };

  var tests = {},
    reporters = [],
    currentTest,
    paused = false, // Just idle if true (after finishing the currentTest if there is one)
    infoVisible = false;

  function generateId() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
  }

  // Async stuff

  var requires = [config.qUrl || "./q", config.bowserUrl || "./bowser", config.jQueryUrl || "./jquery"]; // Things supporting requirejs without hacks first!
  if (config.laterUrl) { // Require later if configured
    requires.push(config.laterUrl);
  }

  require(requires, function(Q, bowser) { //jQuery and later are injected into the global scope :(

    if (config.laterUrl) {
      later.date.localTime();
    }

    // ***** The Test prototype

    var Test = {// Prototype for every test object
      runs: 0,
      errors: 0,

      update: function (options) {
        var test = this;
        Object.keys(options).forEach(function (k) {
          test[k] = options[k];
        });

        if (config.laterUrl) {
          if (typeof test.cronSchedule === "string") {
            delete test.oldTextSchedule;
            if (test.cronSchedule !== test.oldCronSchedule) {
              test.sched = later.parse.cron(test.cronSchedule);
              test.oldCronSchedule = test.cronSchedule;
              test.updateNextRun();
            }
          } else if (typeof test.textSchedule === "string") {
            delete test.oldCronSchedule;
            if (test.textSchedule !== test.oldTextSchedule) {
              test.sched = later.parse.text(test.textSchedule);
              test.oldTextSchedule = test.textSchedule;
              test.updateNextRun();
            }
          } else {
            delete test.sched;
            delete test.oldTextSchedule;
            delete test.oldCronSchedule;
          }
        }
        return new Q.Promise(function (resolve, reject) {
          if (test.load) {
            require([test.load], function (func) {
              test.func = func;
              resolve();
          }, function (err) {
              delete test.func;
              browserError(test, "Loading of test function '" + test.name + "' from '" + test.load + "' failed.", { err: err });
              resolve();
            });
          }
          else {
            browserError(test, "Missing `load` property: Test can not be executed.", { testObject: test });
            resolve();
          }
        });
      },

      updateNextRun: function() {
        if (this.sched) {
          this.nextRun = later.schedule(this.sched).next(1);
        }
        console.log(this.sched, this.nextRun);
      },

      checkExecNow: function () {
        if (this.forcedRun) {
          this.forcedRun = false;
          return true;
        }
        if (this.disabled || paused) {
          return false;
        }
        if (typeof this.browsers === "string" && !navigator.userAgent.match(new RegExp(this.browsers))) {
          return false;
        }
        if (this.nextRun && this.nextRun > Date.now()) {
          return false;
        }
        return true;
      },

      run: function () {
        var test = this;
        test.checkpoint = void 0;
        if (test.checkExecNow()) {
          test.runId = generateId();
          currentTest = test;
          start();
          try {
            return new Q.Promise(function(resolve, reject) {
              if (test.func) {
                test.promise = test.func();
                if (!test.promise || !test.promise.then) {
                  error("Expecting the test definition to return a Promise!").then(resolve);
                } else {
                  test.runs += 1;
                  test.promise.then(function(msg) {
                    return done(msg).then(resolve);
                  }).catch(function (e) {
                    return error(e).then(resolve);
                  });
                }
              }
              else {
                resolve();
              }
            });
          }
          catch (e) {
            return error(e).then(Q.reject);
          }
        }
        return Q.resolve();
      },

      disable: function () {
        this.disabled = true;
      },
      enable: function () {
        this.disabled = false;
      },
      forceRun: function () {
        this.forcedRun = true;
      }
    };

    // Create a new Test (if none exists) and initialize (update) it
    function addTest(name, options) {
      var test;
      if (tests[name]) {
        test = tests[name];
      }
      else {
        test = Object.create(Test);
        test.name = name;
        tests[name] = test;
      }
      return test.update(options);
    }

    // ***** Internal functions

    function loadTests() {
      return new Q.Promise(function (resolve, reject) {
        $.ajax({
          url: "./tests.json",
          success: function (data) {
            var noReportersBefore = (reporters.length === 0);

            reporters = data.reporters || [];

            var loaders = [];
            Object.keys(data.tests || {}).forEach(function (testName) {
              loaders.push(addTest(testName, data.tests[testName]));
            });

            if (noReportersBefore && reporters.length > 0) {
              report(void 0, "browser_start");
            }
            Q.Promise.all(loaders).then(resolve).catch(reject);
          },
          error: function (xhr, status) {
            browserError(undefined, "Loading Test suites failed: '" + status + "'. Trying to continue with the old ones.");
            resolve();
          }
        });
      });
    }

    function cleanup() {
      deleteCookies();
      if (window.localStorage) {
        window.localStorage.clear();
      }
      return true;
    }

    var locked = false;
    var lockedCount = 0;
    function unlock() {
      locked = false;
      lockedCount = 0;
      return locked;
    }

    function main() {
      if (locked) {
        lockedCount++;
        updateTestsInfo();
        if (lockedCount > 100) {
          report(void 0, "browser_emergency_restart", {message: 'Tryed ' + lockedCount + ' times but tests where still blocked with "' + currentTest + '"'}, {async: false});
          location.reload();
        }
        return;
      }
      locked = true;
      currentTest = void 0;
      state("Idle", "idle");
      loadTests()
        .then(updateTestsInfo)
        .then(cleanup)
        .then(function () {
          return Object.keys(tests).reduce(function (cur, nextName) {
            return cur.then(function () {
              if (tests[nextName]) {
                return tests[nextName].run();
              }
              else {
                return Q.resolve();
              }
            });
          }, Q.resolve());
        })
        .then(unlock)
        .catch(function (e) {
          return error(e).then(unlock);
        });
    }

    function updateTestsInfo() {
      $("#tests").empty();
      Object.keys(tests).forEach(function (testName) {
        var test = tests[testName];
        $("<h4>").text(testName).appendTo("#tests");
        $("<ul>")
          .append($("<li>").text("Schedule: " + (test.nextRun && test.nextRun.toLocaleString() || "Immediate")))
          .append($("<li>").text("Browsers: ")
            .append($("<span>")
              .text("/" + (test.browsers || ".*") + "/")
              .css({ color: navigator.userAgent.match(new RegExp(test.browsers || ".*")) ? "#4c4" : "#c44" })))
          .append($("<li>").text("Runs: " + test.runs + " - Errors: " + test.errors))
          .append($("<li>").text("Code: ")
            .append(!test.load ? "-" :
              $("<span>")
              .append(test.load !== "reset" ? "<a href='" + test.load + "' target='_blank'>" + test.load + "</a>" : test.load)
              .append(" (")
              .append($("<a href='#'>Run</a>")
                .click(function () {
                  return forceRun(testName);
                })).
                append(")")))
          .appendTo("#tests");
      });
      $("#date").text("Updated at " + (new Date()).toLocaleTimeString());
      return true;
    }

    function state(message, state) {
      $("#header").attr("class", state);
      $("#message").text(message);
      if (currentTest) {
        $("#testname").text(" - " + currentTest.name);
      }
      else {
        $("#testname").text("");
      }
      return true;
    }

    function deleteCookies() {
      document.cookie.split(";").forEach(function(cookie) {
        var name = cookie.split("=")[0].trim();
        deleteCookie(name);
      });
      deleteCookie("vid");
      deleteCookie("bid");
    }

    function deleteCookie(name) {
      document.cookie = name + "=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT";
    }

    function report(test, state, additional, globalOptions) {
      var data = $.extend({
        testRunId: test && test.runId,
        test: test && test.name,
        state: state,
        lastCheckpoint: test && test.checkpoint,
        browserId: browserId,
        browserName: bowser.name,
        browserVersion: bowser.version,
        userAgent: navigator.userAgent
      }, additional);
      reporters.forEach(function(reporter) {
        var only = reporter.only || {snapshot: ["test_error"]}[reporter.type] || ["*"];
        if (only.indexOf(state) < 0 && only.indexOf("*") < 0) {
          return;
        }
        if (reporter.type === "ajax") {
          $.ajax($.extend(
              { method: "POST", contentType: "application/json; charset=utf-8" }, // Defaults
              globalOptions,
              reporter.options, // user configuration
              { data: JSON.stringify(data) }
          ));
        } else if (reporter.type === "snapshot") {
          $.ajax($.extend(
              { method: "POST", contentType: "text/html; charset=utf-8" }, // Defaults
              globalOptions,
              reporter.options || {}, // user configuration
              { url: reporter.baseUrl + "?testrunid=" + encodeURIComponent(data.testRunId) + "&state=" + encodeURIComponent(data.state) + "&test=" + encodeURIComponent(data.test) + "&browserid=" + encodeURIComponent(data.browserId) + "&browsername=" + encodeURIComponent(data.browserName) + "&browserversion=" + encodeURIComponent(data.browserVersion),
                data: $("#frame").contents()[0].documentElement.innerHTML,
                error: function (xhr, status) {
                  browserError(undefined, "POSTing snapshot failed: '" + status + "'.");
                }
              }
          ));
        } else if (reporter.type === "require") {
          require([reporter.load]), function (customReporter) {
              customReporter(data, $.extend({}, globalOptions, reporter.options));
          };
        }
      });
    }

    function start() {
      if (console && console.log) {
        console.log("Running: " + currentTest.name);
      }
      report(currentTest, "test_start");
      return state("Running", "running");
    }

    function done() {
      if (console && console.log) {
        console.log("Test done: " + currentTest.name);
      }
      state("Test done", "done");
      report(currentTest, "test_success");
      currentTest.updateNextRun();
      $("#frame").attr("src", "about:blank");
      return Q.resolve();
    }

    function error(error) {
      var msg = "Test failed: " + error;
      state(msg, "error");
      if (console && console.log) {
        console.log(msg);
        if (error.stack) {
          console.log(error.stack);
        }
      }
      if (currentTest) {
        currentTest.errors += 1;
        currentTest.updateNextRun();
      }
      report(currentTest, "test_error", {
        message: msg,
        stack: error.stack,
        url: $("#frame")[0].contentWindow.location.href
      });
      $("#frame").attr("src", "about:blank");
      // Show error for 5 seconds before continuing with the next test
      return new Q.Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve($("#frame").contents());
        }, 5000);
      });
    }

    function browserError(test, message, additional) {
      if (console && console.log) {
        console.log(message);
      }
      report(test, "browser_error", $.extend({message: message}, additional));
    }

    function disable(name) {
      if (tests[name]) {
        tests[name].disable();
      }
    }

    function enable(name) {
      if (tests[name]) {
        tests[name].enable();
      }
    }

    function forceRun(name) {
      if (tests[name]) {
        tests[name].forceRun();
      }
    }

    function checkpoint(name) {
      if (currentTest) {
        currentTest.checkpoint = name;
        state("Running: " + name, "running");
        return true;
      }
      else {
        return false;
      }
    }

    function pause() {
      paused = true;
      renderControls();
    }

    function resume() {
      paused = false;
      renderControls();
    }

    function showInfo() {
      infoVisible = true;
      renderControls();
    }

    function hideInfo() {
      infoVisible = false;
      renderControls();
    }

    function renderControls() {
      $("#controls").html("(<ul></ul>)");
      if (paused) {
        $("#controls ul").append($("<li><a href=\"#\">Resume</a></li>").click(resume));
      }
      else {
        $("#controls ul").append($("<li><a href=\"#\">Pause</a></li>").click(pause));
      }
      if (infoVisible) {
        $("#controls ul").append($("<li><a href=\"#\">Hide details</a></li>").click(hideInfo));
        $("#info").show();
      }
      else {
        $("#controls ul").append($("<li><a href=\"#\">Show details</a></li>").click(showInfo));
        $("#info").hide();
      }
      $("#controls ul").append($("<li><a href=\"log#bottom\">Log</a></li>"));
    }

    // ***** Navigation methods

    function waitFor(ms) {
      return new Q.Promise(function(resolve, reject) {
        setTimeout(function() {
          return resolve($("#frame").contents());
        }, ms);
        setTimeout(function() {
          return reject("`waitFor` timed out after " + browsertests.waitForTimeout / 1000 + " seconds");
        }, browsertests.waitForTimeout);
      });
    }

    function executeAndWaitForReady(fn) {
      return new Q.Promise(function(resolve, reject) {
        $("#frame").on("load", function() {
          $("#frame").off("load");
          return $("#frame").contents().ready(function() {
            return resolve($("#frame").contents());
          });
        });
        var timeout = setTimeout(function() {
          return reject("`executeAndWaitForReady` timed out after " + browsertests.waitForTimeout / 1000 + " seconds");
        }, browsertests.waitForTimeout);
        var res = fn();
        if (res && res.then) { // fn was async
          window.clearTimeout(timeout); // The async stuff should care for itself. We'll start the timeout later
          res.then(function() {
            // Restart the timeout
            timeout = setTimeout(function() {
              return reject("`executeAndWaitForReady` timed out after " + browsertests.waitForTimeout / 1000 + " seconds");
            }, browsertests.waitForTimeout);
          }).catch(reject);
        }
      });
    }

    function executeRetrying(fn, retries, interval) {
      if (typeof interval === "undefined") {
        interval = 500;
      }
      if (typeof retries === "undefined") {
        retries = browsertests.waitForTimeout / interval;
      }
      return new Q.Promise(function(resolve, reject) {
        var tryFn = function(ret) {
          try {
            fn();
            resolve($("#frame").contents());
          } catch (e) {
            if (ret === 0) {
              reject("Giving up after " + retries + " retries: " + e);
            } else {
              setTimeout(function() {
                tryFn(ret - 1);
              }, interval);
            }
          }
        };
        tryFn(retries);
      });
    }

    function executeRetryingAndWaitForReady(fn, interval, retries) {
      return executeAndWaitForReady(function() {
        return executeRetrying(fn, interval, retries);
      });
    }

    function open(url) {
      return executeAndWaitForReady(function() {
        $("#frame").attr("src", url);
      });
    }

    function assert(bool, message) {
      if (!bool) {
        throw new Error(message || "Expected \"" + bool + "\" to be true");
      }
      return true;
    }

  // ***** Special test definitions

    $.extend(browsertests, {
      disable: disable,
      enable: enable,
      forceRun: forceRun,
      pause: pause,
      resume: resume,
      waitFor: waitFor,
      executeRetrying: executeRetrying,
      executeAndWaitForReady: executeAndWaitForReady,
      executeRetryingAndWaitForReady: executeRetryingAndWaitForReady,
      open: open,
      assert: assert,
      checkpoint: checkpoint
    });

    define("reset", function() {
      return function () {
        location.reload();
        return Q.resolve();
      };
    });

    addTest("Reset", {load: "reset", cronSchedule: "22 2 * * *"});

    var doAjaxBeforeUnloadEnabled = true;

    function doAjaxBeforeUnload(evt) {
      if (!doAjaxBeforeUnloadEnabled) {
        return;
      }
      doAjaxBeforeUnloadEnabled = false;
      report(void 0, "browser_stop", {}, {async: false});
    }

    $(function() {
      $("body")
        .html('<div id="header"><div id="controls"></div><div id="message">Idle</div><h1>Browsertests!<span id="testname"></span></h1></div>')
        .append('<div id="info"><div id="date"></div><div id="tests"></div></div>')
        .append('<div id="wrapper"><iframe src="" id="frame"></div>');
      $("head").append("<title>Browsertests - " + browserId + "</title>");
      renderControls();
      main();
      setInterval(main, browsertests.idleTime);

      window.onbeforeunload = doAjaxBeforeUnload;
      $(window).unload(doAjaxBeforeUnload);
    });
  });

  return browsertests;

});
