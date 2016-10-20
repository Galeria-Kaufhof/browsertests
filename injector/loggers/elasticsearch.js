/* eslint-env node */

// Elastic search reporter
// Havily inspired by https://github.com/macbre/phantomas/blob/devel/reporters/elasticsearch.js

var Q = require('q');
var elasticsearch = require('elasticsearch');

function ensureIndex(elasticClient, config, indexName) {
  return new Q.Promise(function (resolve, reject) {
    elasticClient.indices.exists({ index: indexName }, function (err, exists) {
      if (typeof err === "undefined") {
        if (exists) {
          resolve();
        }
        else {
          // index does not exists, we have to create it and define the mapping
          elasticClient.indices.create({ index: indexName }, function (err) {
            if (typeof (err) === "undefined") {
              var properties = {
                serverDate: {
                  "type": "date",
                  "format": "yyyy-MM-dd'T'HH:mm:ss.SSSZ" // date.toISOString
                }
              };
              ["browserId", "browserName", "browserVersion", "snapshotUrl", "lastCheckpoint", "state", "test", "testRunId", "userAgent", "url", "message"].forEach(function (stringField) {
                properties[stringField] = {
                  "type": "string",
                  index: "not_analyzed"
                };
              });
              var mapping = {};
              mapping[config.documentType] = {
                properties: properties
              };
              elasticClient.indices.putMapping({
                type: config.documentType,
                index: indexName,
                body: mapping
              }, function (err) {
                if (typeof (err) === "undefined") {
                  resolve();
                }
                else {
                  reject(err);
                }
              });
            }
            else {
              reject(err);
            }
          });
        }
      }
      else {
        reject(err);
      }
    });
  });
}

// create and index an elasticsearch document with metrics data
function storeDocument(elasticClient, config, indexName, documentBody) {
  return new Q.Promise(function (resolve, reject) {
    elasticClient.create({
      index: indexName,
      type: config.documentType,
      id: '',
      body: documentBody
    }, function (error, data) {
      if (typeof error === "undefined") {
        resolve(data._id);
      }
      else {
        reject(error);
      }
    });
  });
}

function store(elasticClient, config, data) {
  var today = new Date();
  var indexName = config.indexPattern
    .replace("{year}", today.getFullYear())
    .replace("{month}", ("0" + (today.getMonth() + 1)).slice(-2))
    .replace("{day}", ("0" + today.getDate()).slice(-2));
  return ensureIndex(elasticClient, config, indexName).then(function () {
    return storeDocument(elasticClient, config, indexName, data);
  });
}

module.exports = function (options) {

  if (options.elasticsearchHost) {
    var config = {
      documentType: options.elasticsearchDocumentType || 'browsertests',
      indexPattern: options.elasticsearchIndexPattern || 'browsertests-{year}.{month}'
    };
    var elasticClient = new elasticsearch.Client({ host: options.elasticsearchHost });

    options.eventEmitter.on('log', function (msg) {
      store(elasticClient, config, msg).catch(function (err) {
        console.log("Elasticsearch error: ", err);
      });
    });

  }

};