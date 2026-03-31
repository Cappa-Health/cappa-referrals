// CloudFront Function to rewrite short URLs to full paths
// This replaces the S3 redirect rules for better performance

function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // URL rewrites for landing pages
    var rewrites = {
        '/lose-weight': '/program_landings/lose_weight.html',
        '/lower-blood-pressure': '/program_landings/lower_blood_pressure.html',
        '/lower-blood-sugar': '/program_landings/lower_blood_sugar.html'
    };

    // Default root path to lose-weight page
    if (uri === '/' || uri === '') {
        request.uri = '/program_landings/lose_weight.html';
        return request;
    }

    // Check if the URI matches any rewrite rule
    if (rewrites[uri]) {
        request.uri = rewrites[uri];
    }

    // If URI is a directory (ends with /), append index.html
    else if (uri.endsWith('/')) {
        request.uri += 'index.html';
    }

    return request;
}
