/* eslint-env browser, amd, jquery */

define('browsertests-frame', ['browsertests-base', 'q', 'bowser', 'jquery'], function (base, Q, bowser) {

  var paused = false, // Just idle if true (after finishing the currentTest if there is one)
    reporters = [],
    currentTest,
    infoVisible = false;

  function loadTests() {
    return new Q.Promise(function (resolve, reject) {
      jQuery.ajax({
        url: './tests.json',
        success: function (data) {
          var noReportersBefore = (reporters.length === 0);

          reporters = data.reporters || [];

          var loaders = [];
          Object.keys(data.tests || {}).forEach(function (testName) {
            loaders.push(base.addTest(testName, data.tests[testName]));
          });

          if (noReportersBefore && reporters.length > 0) {
            report('system:start');
          }
          Q.Promise.all(loaders).then(resolve).catch(reject);
        },
        error: function (xhr, status) {
          base.emit('system:error', {msg: 'Loading Test suites failed: "' + status + '". Trying to continue with the old ones.'});
          resolve();
        }
      });
    });
  }

  function report(state, ev, globalOptions) {
    ev = ev || {};
    var data = jQuery.extend({}, ev, {
      testRunId: ev.test && ev.test.runId,
      test: ev.test && ev.test.name,
      state: state,
      lastCheckpoint: ev.test && ev.test.checkpoint,
      browserId: base.browserId,
      browserName: bowser.name,
      browserVersion: bowser.version,
      userAgent: navigator.userAgent,
      url: jQuery('#frame')[0].contentWindow.location.href
    });
    reporters.forEach(function (reporter) {
      var only = reporter.only || { snapshot: ['test:failure'] }[reporter.type] || ['*'];
      if (only.indexOf(state) < 0 && only.indexOf('*') < 0) {
        return;
      }
      if (reporter.type === 'ajax') {
        jQuery.ajax(jQuery.extend(
          { method: 'POST', contentType: 'application/json; charset=utf-8' }, // Defaults
          globalOptions,
          reporter.options, // user configuration
          { data: JSON.stringify(data) }
        ));
      } else if (reporter.type === 'snapshot') {
        jQuery.ajax(jQuery.extend(
          { method: 'POST', contentType: 'text/html; charset=utf-8' }, // Defaults
          globalOptions,
          reporter.options || {}, // user configuration
          {
            url: reporter.baseUrl + '?testrunid=' + encodeURIComponent(data.testRunId) + '&state=' + encodeURIComponent(data.state) + '&test=' + encodeURIComponent(data.test) + '&browserid=' + encodeURIComponent(data.browserId) + '&browsername=' + encodeURIComponent(data.browserName) + '&browserversion=' + encodeURIComponent(data.browserVersion),
            data: jQuery('#frame').contents()[0].documentElement.innerHTML,
            error: function (xhr, status) {
              base.emit('system:error', { msg: 'POSTing snapshot failed: "' + status + '".' });
            }
          }
        ));
      } else if (reporter.type === 'require') {
        require([reporter.load], function (customReporter) {
          customReporter(data, jQuery.extend({}, globalOptions, reporter.options));
        });
      }
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
        report('system:emergency_restart', { msg: 'Tryed ' + lockedCount + ' times but tests where still blocked with "' + currentTest + '"' }, { async: false });
        location.reload();
      }
      return;
    }
    locked = true;
    currentTest = void 0;
    state('Idle', 'idle');
    loadTests()
      .then(updateTestsInfo)
      .then(cleanup)
      .then(function () {
        if (!paused) {
          return Object.keys(base.tests).reduce(function (cur, nextName) {
            return cur.then(function () {
              currentTest = base.tests[nextName];
              if (currentTest) {
                return currentTest.runIfScheduled();
              }
              else {
                return Q.resolve();
              }
            });
          }, Q.resolve());
        }
        else {
          return true;
        }
      })
      .then(unlock)
      .catch(function (e) {
        base.emit('system:error', { msg: e.message, exception: e });
        unlock();
      });
  }

  function updateTestsInfo() {
    jQuery('#tests').empty();
    Object.keys(base.tests).forEach(function (testName) {
      var test = base.tests[testName];
      jQuery('<h4>').text(testName).appendTo('#tests');
      jQuery('<ul>')
        .append(jQuery('<li>').text('Schedule: ' + (test.nextRun && test.nextRun.toLocaleString() || 'Immediate')))
        .append(jQuery('<li>').text('Browsers: ')
          .append(jQuery('<span>')
            .text('/' + (test.browsers || '.*') + '/')
            .css({ color: navigator.userAgent.match(new RegExp(test.browsers || '.*')) ? '#4c4' : '#c44' })))
        .append(jQuery('<li>').text('Runs: ' + test.runs + ' - Errors: ' + test.errors))
        .append(jQuery('<li>').text('Code: ')
          .append(!test.load ? '-' :
            jQuery('<span>')
              .append(test.load !== 'reset' ? '<a href="' + test.load + '" target="_blank">' + test.load + '</a>' : test.load)
              .append(' (')
              .append(jQuery('<a href="#">Run</a>')
                .click(function () {
                  return forceRun(testName);
                })).
              append(')')))
        .appendTo('#tests');
    });
    jQuery('#date').text('Updated at ' + (new Date()).toLocaleTimeString());
    return true;
  }

  function state(message, state) {
    jQuery('#header').attr('class', state);
    jQuery('#message').text(message);
    if (currentTest) {
      jQuery('#testname').text(' - ' + currentTest.name);
    }
    else {
      jQuery('#testname').text('');
    }
    return true;
  }

  function deleteCookies() {
    document.cookie.split(';').forEach(function (cookie) {
      var name = cookie.split('=')[0].trim();
      deleteCookie(name);
    });
    deleteCookie('vid');
    deleteCookie('bid');
  }

  function deleteCookie(name) {
    document.cookie = name + '=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT';
  }

  base.on('test:start', function (ev) {
    window.console.log('Running: ' + ev.test.name);
    state('Running', 'running');
    report('test:start', ev);
  });

  base.on('test:success', function (ev) {
    window.console.log('Test success: ' + ev.test.name);
    state('Test succeeded', 'success');
    report('test:success', ev);
    jQuery('#frame').attr('src', 'about:blank');
  });

  base.on('test:failure', function (ev) {
    var msg = 'Test failed: ' + ev.msg;
    window.console.log(msg);
    if (ev.exception && ev.exception.stack) {
      window.console.log(ev.exception.stack);
    }
    state(msg, 'failed');
    report('test:failure', ev);
    jQuery('#frame').attr('src', 'about:blank');
  });

  base.on('system:error', function (ev) {
    window.console.log(ev.message);
    report('system:error', ev);
  });

  function forceRun(name) {
    if (base.tests[name]) {
      base.tests[name].forceRun();
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

  function setCheckpoint(name) {
    if (currentTest) {
      currentTest.checkpoint = name;
      state('Running: ' + name, 'running');
      return true;
    }
    else {
      return false;
    }
  }



  function renderControls() {
    jQuery('#controls').html('(<ul></ul>)');
    if (paused) {
      jQuery('#controls ul').append(jQuery('<li><a href="#">Resume</a></li>').click(resume));
    }
    else {
      jQuery('#controls ul').append(jQuery('<li><a href="#">Pause</a></li>').click(pause));
    }
    if (infoVisible) {
      jQuery('#controls ul').append(jQuery('<li><a href="#">Hide details</a></li>').click(hideInfo));
      jQuery('#info').show();
    }
    else {
      jQuery('#controls ul').append(jQuery('<li><a href="#">Show details</a></li>').click(showInfo));
      jQuery('#info').hide();
    }
    jQuery('#controls ul').append(jQuery('<li><a href="log#bottom">Log</a></li>'));
  }

  var doAjaxBeforeUnloadEnabled = true;

  function doAjaxBeforeUnload() {
    if (!doAjaxBeforeUnloadEnabled) {
      return;
    }
    doAjaxBeforeUnloadEnabled = false;
    report('system:stop', {}, { async: false });
  }

  jQuery(function () {
    jQuery('body')
      .html('<div id="header"><div id="controls"></div><div id="message">Idle</div><h1>Browsertests!<span id="testname"></span></h1></div>')
      .append('<div id="info"><div id="date"></div><div id="tests"></div></div>')
      .append('<div id="wrapper"><iframe src="" id="frame"></div>');
    jQuery('head').append('<title>Browsertests - ' + base.browserId + '</title>');
    renderControls();
    main();
    setInterval(main, base.idleTime);

    window.onbeforeunload = doAjaxBeforeUnload;
    jQuery(window).unload(doAjaxBeforeUnload);
  });

  return {
    state: state,
    setCheckpoint: setCheckpoint,
    currentTest: function() { return currentTest; }
  };

});
