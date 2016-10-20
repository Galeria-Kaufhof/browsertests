/* globals define */

define(["browsertests", "jquery"], function (browsertests) {

  return function () {

    return browsertests.open("/control/logout")
      .then(function () {
        browsertests.checkpoint("Search");
        return browsertests.open("/");
      })
      .then(function (container) {
        container.find(".gk-header__search__input").val("Socken");
        return browsertests.execute(function () {
          container.find(".gk-header__search__button")[0].click();
        }, {retry: true});
      })
      .then(browsertests.waitForDOMContentLoaded)
      .then(function (container) {
        browsertests.checkpoint("ADS");
        return browsertests.execute(function () {
          container.find('.gk-article:first-child a')[0].click();
        }, {retry: true});
      })
      .then(browsertests.waitForDOMContentLoaded)
      .then(function (container) {
        browsertests.checkpoint("Add to Cart");
        return browsertests.execute(function () { // Layer (no "ready")
          container.find('.ev-product__orderbutton.gk-button--enabled')[0].click();
        }, {retry: true});
      })
      .then(function (container) {
        browsertests.checkpoint("View Cart");
        return browsertests.execute(function () {
          container.find('.or-cartentry .gk-button--primary')[0].click();
        }, {retry: true});
      })
      .then(browsertests.waitForDOMContentLoaded)
      .then(function (container) {
        browsertests.checkpoint("Checkout");
        return browsertests.execute(function () {
          container.find('.or-page__cart .gk-button--next')[0].click();
        }, {retry: true});
      })
      .then(browsertests.waitForDOMContentLoaded);

  };

});
