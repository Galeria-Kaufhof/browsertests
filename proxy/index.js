var zlib = require('zlib'),
  httpProxy = require('http-proxy');

module.exports = function (target, options) {
  options = options || {};

  function replaceUrls(data) {
    if (typeof data === "string") {
      data = data.replace(new RegExp(options.target, "g"), "/");
    }
    return data;
  }

  function rewriteLocation(proxyRes, request, response) {
    if (proxyRes.headers && proxyRes.headers['location']) {
      // Replace URIs in location headers
      var _writeHead = response.writeHead;
      response.writeHead = function (code, headers) {
        response.setHeader('location', replaceUrls(proxyRes.headers['location']));
        _writeHead.apply(this, arguments);
      };
    };
  };

  function rewriteBody(proxyRes, request, response) {
    var _end = response.end,
      chunks,
      _write = response.write,
      _writeHead = response.writeHead,
      contentEncoding = proxyRes.headers && proxyRes.headers['content-encoding'],
      contentType = proxyRes.headers && proxyRes.headers['content-type'],
      gunzip = zlib.Gunzip();

    if (options.rewriteBody && typeof contentType === "string") {
      var maintype = contentType.replace(/;.*$/, "").toLowerCase();
      if (options.rewriteBody.indexOf(maintype) >= 0) {
        response.writeHead = function (code, headers) {
          response.removeHeader('Content-Length');
          if (headers) {
            delete headers['content-length'];
          }

          // This disables chunked encoding
          response.removeHeader('transfer-encoding');

          if (contentEncoding && contentEncoding.toLowerCase() === 'gzip') {
            response.isGziped = true;

            // Strip off the content encoding since it will change.
            response.removeHeader('Content-Encoding');
            if (headers) {
              delete headers['content-encoding'];
            }

          }

          _writeHead.apply(this, arguments);
        };

        response.write = function (data) {
          if (response.isGziped) {
            gunzip.write(data);
          }
          else {
            append(data);
          }
        };

        function append(data) {
          if (chunks) {
            chunks += data;
          } else {
            chunks = data;
          }
        }

        gunzip.on('data', function (data) {
          append(data);
        });

        gunzip.on('end', function (data) {
          flush(data);
        });

        response.end = function (data) {
          if (response.isGziped) {
            gunzip.end(data);
          }
          else {
            flush(data);
          }
        };

        function flush(data) {
          append(data);
          if (chunks && chunks.toString) {
            _write.apply(response, [replaceUrls(chunks.toString())]);
          }
          _end.apply(response);
        }
      };
    };
  };

  function proxyErr(error, req, res) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'test/html' });
    }
    res.end("<!doctype HTML><html><body><h1>Proxy error</h1><pre>" + error + "</pre></body>");
  };

  var proxy = httpProxy.createProxyServer({ secure: false })
    .on('proxyRes', rewriteLocation)
    .on('proxyRes', rewriteBody)
    .on('error', proxyErr);

  return function (request, response, next) {
    return proxy.web(request, response, { target: target, changeOrigin: true });
  }
};