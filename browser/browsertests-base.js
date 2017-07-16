/* eslint-env browser, amd, jquery */

if (!window.console) {
  window.console = {
    log: function () {
      return true;
    }
  };
}

define('browsertests-base', ['q', 'later'], function (Q) {

  function generateId() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
  }

  var browserId = (document.cookie.match('(^|; )browserId=([^;]*)') || 0)[2];
  if (!browserId) {
    browserId = generateId();
    document.cookie = 'browserId=' + browserId + ';path=' + window.location.pathname;
  }

  function emit(eventType, data) {
    return document.dispatchEvent(new CustomEvent('bt:' + eventType, { detail: data })) &&
      document.dispatchEvent(new CustomEvent('bt:any', { detail: { originalEventType: eventType, originalEventData: data }}));
  }

  function on(eventType, listener) {
    return document.addEventListener('bt:' + eventType, function (e) { listener(e.detail); });
  }

  function onAnyEvent(listener) {
    return document.addEventListener('bt:any', function (e) { listener(e.detail.originalEventType, e.detail.originalEventData); });
  }

  var tests = {}; // Currently defined tests

  // ***** The Test prototype

  var Test = { // Prototype for every test object
    runs: 0,
    errors: 0,

    update: function (options) {
      var test = this;
      Object.keys(options).forEach(function (k) {
        test[k] = options[k];
      });

      if (typeof test.cronSchedule === 'string') {
        delete test.oldTextSchedule;
        if (test.cronSchedule !== test.oldCronSchedule) {
          test.sched = later.parse.cron(test.cronSchedule);
          test.oldCronSchedule = test.cronSchedule;
          test.updateNextRun();
        }
      } else if (typeof test.textSchedule === 'string') {
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

      return new Q.Promise(function (resolve) {
        if (test.load) {
          require([test.load], function (func) {
            test.func = func;
            resolve();
          }, function (err) {
            delete test.func;
            emit('system:error', { test: test, msg: 'Loading of test function "' + test.name + '" from "' + test.load + '" failed.', err: err });
            resolve();
          });
        }
        else {
          emit('system:error', { test: test, msg: 'Missing `load` property: Test can not be executed.', testObject: test });
          resolve();
        }
      });
    },

    updateNextRun: function () {
      if (this.sched) {
        this.nextRun = later.schedule(this.sched).next(1);
      }
    },

    checkSchedule: function () {
      if (this.forcedRun) {
        this.forcedRun = false;
        return true;
      }
      if (this.disabled) {
        return false;
      }
      if (typeof this.browsers === 'string' && !navigator.userAgent.match(new RegExp(this.browsers))) {
        return false;
      }
      if (this.nextRun && this.nextRun > Date.now()) {
        return false;
      }
      return true;
    },

    runIfScheduled: function () {
      var test = this;
      test.checkpoint = void 0;
      if (!test.checkSchedule()) {
        return Q.resolve();
      }
      test.runId = generateId();
      emit('test:start', { test: test });
      try {
        return new Q.Promise(function (resolve) {
          if (test.func) {
            test.promise = test.func();
            if (!test.promise || !test.promise.then) {
              emit('system:error', {  test: test, msg: 'Expecting the test definition to return a Promise!' });
              resolve();
            } else {
              test.runs += 1;
              test.promise.then(function (msg) {
                test.updateNextRun();
                emit('test:success', {  test: test, msg: msg });
                resolve();
              }).catch(function (e) {
                test.errors += 1;
                test.updateNextRun();
                emit('test:failure', {  test: test, msg: "" + e, exception: e });
                resolve();
              });
            }
          }
          else {
            resolve();
          }
        });
      }
      catch (e) {
        emit('system:error', {test: test, msg: "" + e, exception: e});
        return Q.reject();
      }
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

  // ***** Special test definitions

  define('reset', ['q'], function (Q) {
    return function () {
      location.reload();
      return Q.resolve();
    };
  });

  addTest('Reset', { load: 'reset', cronSchedule: '22 2 * * *' });


  return {
    waitForTimeout: 20000,
    idleTime: 5000,
    browserId: browserId,
    generateId: generateId,
    addTest: addTest,
    tests: tests,
    emit: emit,
    on: on,
    onAnyEvent: onAnyEvent
  };

});
