// CloudFront Function (runtime cloudfront-js-2.0). Terraform fills in the placeholders below:
// the environment's domain and the comma-separated hosts that redirect to it (www and other
// domains, ADR 0020).
var CANONICAL_HOST = '__CANONICAL_HOST__';
var REDIRECT_HOSTS = '__REDIRECT_HOSTS__'.split(',');

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';

  if (host !== '' && REDIRECT_HOSTS.indexOf(host) !== -1) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://' + CANONICAL_HOST + request.uri + toQueryString(request.querystring),
        },
      },
    };
  }

  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.split('/').pop().indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}

function toQueryString(querystring) {
  var parts = [];
  Object.keys(querystring).forEach(function (key) {
    var entry = querystring[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    values.forEach(function (item) {
      parts.push(item.value === '' ? key : key + '=' + item.value);
    });
  });
  return parts.length > 0 ? '?' + parts.join('&') : '';
}
