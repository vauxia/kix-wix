function fixHeaders(headers, yourDomain, targetHost, targetUser, targetPath) {
    const newHeaders = new Headers(headers)

    if (headers.has('set-cookie')) {
        const allSetCookieHeaders = []

        // Iterate through all headers to find set-cookie headers
        for (const [name, value] of headers.entries()) {
            if (name.toLowerCase() === 'set-cookie') {
                const fixedCookie = value
                    .replace(new RegExp(`Domain=${targetUser}.wixsite.com`, 'gi'), `Domain=${yourDomain}`)
                    .replace(new RegExp(`Domain=\.${targetUser}.wixsite.com`, 'gi'), `Domain=.${yourDomain}`)
                    .replace(/Domain=wixsite\.com/gi, `Domain=${yourDomain}`)
                    .replace(new RegExp(`Domain=${targetHost}`, 'gi'), `Domain=${yourDomain}`)
                allSetCookieHeaders.push(fixedCookie)
            }
        }

        // Remove all existing set-cookie headers
        newHeaders.delete('set-cookie')

        // Add back the fixed cookies
        allSetCookieHeaders.forEach(cookie => {
            newHeaders.append('set-cookie', cookie)
        })
    }
    // Force Cloudflare to cache this response
    // NOTE that this deletes the cookies we just carefully modified.
    // If cookies are necessary, comment this out. If not, maybe don't use the above block
    newHeaders.delete('set-cookie'); // Cookies prevent caching

    newHeaders.delete('age'); // Cookies prevent caching
    newHeaders.delete('cache-control');
    newHeaders.set('Cache-Control', 'public, max-age=300, s-maxage=3600');

    newHeaders.set('Access-Control-Allow-Origin', '*')
    newHeaders.delete('x-frame-options')
    newHeaders.delete('content-security-policy')
    newHeaders.delete('content-security-policy-report-only')

    return newHeaders
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url)

        // Configuration
        const TARGET_ORIGIN = env.TARGET_ORIGIN || 'https://example.wixsite.com/example'
        const YOUR_DOMAIN = url.hostname

        // Parse the target URL
        const targetURL = new URL(TARGET_ORIGIN)
        const targetHost = targetURL.hostname
        const targetPath = targetURL.pathname

        // Extract targetUser from wixsite.com subdomain
        const targetUser = targetHost.includes('wixsite.com')
            ? targetHost.split('.')[0]
            : null
        let newHeaders;

        // Block analytics and tracking requests
        if (url.hostname === 'frog.wix.com' ||
            url.hostname === 'panorama.wixapps.net' ||
            url.hostname === 'static.parastorage.com' && url.pathname.includes('fedops') ||
            url.pathname.includes('bolt-performance') ||
            url.pathname.includes('bulklog')) {
            return new Response('', { status: 204 }); // Return empty successful response
        }

        // Only proxy requests to your domain
        if (url.hostname === YOUR_DOMAIN) {

            // Handle ALL Wix API calls with proper domain header rewriting
            if (url.pathname.startsWith('/_api/')) {

                // For ALL API calls, completely rewrite request headers to match original domain
                const targetUrl = `${targetURL.origin}${targetPath}${url.pathname}${url.search}`

                // Create headers that look like they're coming from the original Wix site
                const modifiedHeaders = new Headers(request.headers)
                modifiedHeaders.set('Host', targetHost)
                modifiedHeaders.set('Origin', targetURL.origin)
                modifiedHeaders.set('Referer', targetURL.origin + targetPath)

                // Fix any other domain references in headers
                for (const [name, value] of modifiedHeaders.entries()) {
                    if (typeof value === 'string' && value.includes(YOUR_DOMAIN)) {
                        modifiedHeaders.set(name, value.replace(new RegExp(YOUR_DOMAIN, 'g'), targetHost))
                    }
                }

                const modifiedRequest = new Request(targetUrl, {
                    method: request.method,
                    headers: modifiedHeaders,
                    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
                })

                try {
                    const response = await fetch(modifiedRequest)
                    // Minimal header changes for API calls
                    const newHeaders = new Headers(response.headers)
                    newHeaders.set('Access-Control-Allow-Origin', '*')

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })
                } catch (error) {
                    return new Response('API Error: ' + error.message, { status: 500 })
                }
            } else if (url.pathname.startsWith('/_partials/') ||
                url.pathname.includes('wix-thunderbolt')) {

                const targetUrl = `${targetURL.origin}${targetPath}${url.pathname}${url.search}`

                const modifiedRequest = new Request(targetUrl, {
                    method: request.method,
                    headers: {
                        ...request.headers,
                        'Host': targetHost,
                        'Origin': targetURL.origin,
                        'Referer': targetURL.origin + targetPath
                    },
                    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
                })

                try {
                    const response = await fetch(modifiedRequest)
                    const newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })
                } catch (error) {
                    return new Response('API Error: ' + error.message, { status: 500 })
                }
            }

            // Construct the target URL
            const targetUrl = `${targetURL.origin}${targetPath}${url.pathname}${url.search}`
            // Add this right after the targetUrl construction:
            console.log('Original URL:', request.url);
            console.log('Target URL:', targetUrl);
            console.log('Pathname:', url.pathname);
            console.log('Target Path:', targetPath);

            // Create new request
            const modifiedRequest = new Request(targetUrl, {
                method: request.method,
                headers: {
                    ...request.headers,
                    'Host': targetHost,
                    'Origin': targetURL.origin,
                    'Referer': TARGET_ORIGIN
                },
                body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
            })

            try {
                const response = await fetch(modifiedRequest)
                const contentType = response.headers.get('content-type') || ''

                // Handle different content types appropriately
                if (contentType.includes('application/json')) {
                    // JSON - pass through unchanged to avoid parse errors
                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })

                } else if (contentType.includes('text/html')) {
                    // TEMPORARY DEBUG - replace your HTML return with this:
                    return new Response(`
DEBUG INFO:
Original URL: ${request.url}
URL Pathname: ${url.pathname}
Target Origin: ${TARGET_ORIGIN}
Target Host: ${targetHost}
Target Path: ${targetPath}
Constructed Target URL: ${targetUrl}
Response Status: ${response.status}
Content Type: ${contentType}
Body Length: ${body.length}
First 500 chars: ${body.substring(0, 500)}
`, { headers: { 'Content-Type': 'text/plain' } });

                    // Create cache key
                    const cacheKey = new Request(request.url, {
                        method: 'GET',
                        headers: { 'User-Agent': request.headers.get('User-Agent') || '' }
                    });

                    // Check cache first
                    const cachedResponse = await caches.default.match(cacheKey);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // HTML - modify URLs carefully to preserve JSON
                    let body = await response.text()

                    // Remove WIX header
                    body = body.replace(/<div[^>]*id="WIX_ADS"[^>]*>[\s\S]*?<\/div>/gi, '');

                    // Function to safely replace URLs in JSON strings
                    function replaceInJson(text, oldDomain, newDomain, oldPath) {
                        // Replace JSON-escaped URLs (with \/)
                        text = text.replace(
                            new RegExp(`https:\\\\\\/\\\\\\/${oldDomain.replace(/\./g, '\\.')}${oldPath.replace(/\//g, '\\\\\\/')}`, 'g'),
                            `https:\\/\\/${newDomain}`
                        )
                        text = text.replace(
                            new RegExp(`https:\\\\\\/\\\\\\/${oldDomain.replace(/\./g, '\\.')}`, 'g'),
                            `https:\\/\\/${newDomain}`
                        )

                        // Replace regular URLs in HTML
                        text = text.replace(
                            new RegExp(`https://${oldDomain.replace(/\./g, '\\.')}${oldPath.replace(/\//g, '\\/')}`, 'g'),
                            `https://${newDomain}`
                        )
                        text = text.replace(
                            new RegExp(`https://${oldDomain.replace(/\./g, '\\.')}`, 'g'),
                            `https://${newDomain}`
                        )

                        // Replace relative paths
                        text = text.replace(new RegExp(oldPath.replace(/\//g, '\\/'), 'g'), '')
                        text = text.replace(new RegExp(oldDomain.replace(/\./g, '\\.'), 'g'), newDomain)

                        return text
                    }

                    body = replaceInJson(body, targetHost, YOUR_DOMAIN, targetPath)

                    // Remove integrity attributes that cause hash mismatches
                    body = body.replace(/\s+integrity="[^"]*"/g, '')
                    body = body.replace(/\s+integrity='[^']*'/g, '')
                    body = body.replace(/<script([^>]*)\s+integrity="[^"]*"([^>]*)>/gi, '<script$1$2>')
                    body = body.replace(/<link([^>]*)\s+integrity="[^"]*"([^>]*)>/gi, '<link$1$2>')

                    // Add comprehensive analytics blocking and TPA suppression
                    body = body.replace(
                        /<\/head>/i,
                        `<script>
// Block analytics and tracking
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && (
    url.includes('frog.wix.com') ||
    url.includes('panorama.wixapps.net') ||
    url.includes('bolt-performance') ||
    url.includes('bulklog') ||
    url.includes('fedops')
  )) {
    console.log('🚫 Blocked analytics request:', url);
    return Promise.resolve(new Response('', { status: 204 }));
  }
  return originalFetch.apply(this, arguments);
};

// Override XMLHttpRequest for analytics blocking
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
  if (typeof url === 'string' && (
    url.includes('frog.wix.com') ||
    url.includes('panorama.wixapps.net') ||
    url.includes('bolt-performance') ||
    url.includes('bulklog')
  )) {
    console.log('🚫 Blocked XHR analytics request:', url);
    this.open = function() {}; // Disable this request
    return;
  }
  return originalXHROpen.apply(this, arguments);
};

// Remove integrity from dynamically added scripts/links
const originalCreateElement = document.createElement;
document.createElement = function(tagName) {
  const element = originalCreateElement.call(this, tagName);
  if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'link') {
    const originalSetAttribute = element.setAttribute;
    element.setAttribute = function(name, value) {
      if (name.toLowerCase() === 'integrity') {
        return; // Skip setting integrity attribute
      }
      return originalSetAttribute.call(this, name, value);
    };
  }
  return element;
};

// Override console methods to filter TPA messages
(function() {
  const originalMethods = ['log', 'warn', 'error', 'info'];
  originalMethods.forEach(method => {
    const original = console[method];
    console[method] = function(...args) {
      const message = args.join(' ');
      if (message.includes('TPA message') || message.includes('destroyed page')) {
        return; // Suppress TPA messages
      }
      original.apply(console, args);
    };
  });
})();
</script>
</head>`
                    )

                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)
                    newHeaders.set('Content-Type', contentType)

                    // Cache HTML for 5 minutes browser, 1 hour Cloudflare
                    newHeaders.set('Cache-Control', 'public, max-age=300, s-maxage=3600')

                    const responseToCache = new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });

                    // Cache the response
                    ctx.waitUntil(caches.default.put(cacheKey, responseToCache.clone()));

                    return responseToCache;

                } else if (contentType.includes('text/css') ||
                    contentType.includes('application/javascript') ||
                    contentType.includes('text/javascript')) {
                    // CSS/JS - modify URLs but preserve exact MIME type
                    let body = await response.text()

                    // Only replace URL patterns, not arbitrary text
                    body = body.replace(new RegExp(`url\\(['"]?https://${targetUser}.wixsite.com${targetPath}`, 'g'), `url('https://${YOUR_DOMAIN}`)
                    body = body.replace(new RegExp(`src=['"]https://${targetUser}.wixsite.com${targetPath}`, 'g'), `src="https://${YOUR_DOMAIN}`)
                    body = body.replace(new RegExp(`href=['"]https://${targetUser}.wixsite.com${targetPath}`, 'g'), `href="https://${YOUR_DOMAIN}`)

                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)
                    newHeaders.set('Content-Type', contentType) // Preserve exact MIME type

                    // Cache CSS/JS assets for 24 hours browser, 7 days Cloudflare
                    newHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800')

                    return new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })

                } else {
                    // Everything else (images, fonts, etc.) - pass through unchanged
                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)

                    // Cache static assets aggressively - 24 hours browser, 30 days Cloudflare
                    if (contentType.includes('image/') ||
                        contentType.includes('font/') ||
                        contentType.includes('application/octet-stream') ||
                        url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|woff|woff2|ttf|eot)$/)) {
                        newHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000')
                    } else {
                        // Other assets - shorter cache
                        newHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
                    }

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })
                }

            } catch (error) {
                return new Response('Proxy Error: ' + error.message, {status: 500})
            }
        }

        // For other hostnames, return original request
        return fetch(request)
    }
}