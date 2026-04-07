// CloudFront Function to rewrite short URLs to full paths
// This replaces the S3 redirect rules for better performance

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // URL rewrites for landing pages
  var rewrites = {
    "/lose-weight": "/program_landings/lose_weight.html",
    "/lower-blood-pressure": "/program_landings/lower_blood_pressure.html",
    "/lower-blood-sugar": "/program_landings/lower_blood_sugar.html",
    "/dashboard": "/program_landings/dashboard.html",
  };
  var passthroughPrefixes = ["/program_landings/", "/public/", "/assets/"];
  var passthroughFiles = {
    "/index.html": true,
    "/web.css": true,
    "/favicon.ico": true,
  };

  // Default root path to lose-weight page
  if (uri === "/" || uri === "") {
    request.uri = "/program_landings/lose_weight.html";
    return request;
  }

  // Check if the URI matches any rewrite rule
  if (rewrites[uri]) {
    request.uri = rewrites[uri];
  }

  // Allow direct requests for known static files and program landing assets.
  else if (
    passthroughFiles[uri] ||
    hasAllowedPrefix(uri, passthroughPrefixes)
  ) {
    return request;
  }

  // Everything else redirects to the default short path so the browser URL is corrected.
  else {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: { value: "/lose-weight" },
      },
    };
  }

  return request;
}

function hasAllowedPrefix(uri, prefixes) {
  for (var i = 0; i < prefixes.length; i++) {
    if (uri.indexOf(prefixes[i]) === 0) {
      return true;
    }
  }

  return false;
}
