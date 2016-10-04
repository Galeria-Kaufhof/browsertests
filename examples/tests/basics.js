/* globals define */

define(["browsertests"], function (browsertests) {

  return function () {

    return browsertests.open("/control/logout")
      .then(function (container) {
        browsertests.checkpoint("Search");
        return browsertests.open("/");
      })
      .then(function (container) {
        container.find(".gk-header__search__input").val("Socken");
        container.find('.or-cartentry .gk-button--primary')[0].click();
        return browsertests.executeRetryingAndWaitForReady(function () {
          container.find(".gk-header__search__button")[0].click();
        });
      })
      .then(function (container) {
        browsertests.checkpoint("ADS");
        return browsertests.executeRetryingAndWaitForReady(function () {
          container.find('.gk-article:first-child a')[0].click();
        });
      })
      .then(function (container) {
        browsertests.checkpoint("Add to Cart");
        return browsertests.executeRetrying(function () { // Layer (no "ready")
          container.find('.ev-product__orderbutton.gk-button--enabled')[0].click();
        });
      })
      .then(function (container) {
        browsertests.checkpoint("View Cart");
        return browsertests.executeRetryingAndWaitForReady(function () {
          container.find('.or-cartentry .gk-button--primary')[0].click();
        });
      })
      .then(function (container) {
        browsertests.checkpoint("Checkout");
        return browsertests.executeRetryingAndWaitForReady(function () {
          container.find('.or-page__cart .gk-button--next')[0].click();
        });
      });

  };

});
