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
        const TARGET_ORIGIN = env.TARGET_ORIGIN || 'https://allie2490.wixsite.com/welcome-cheetos'
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

        // Only proxy requests to your domain
        if (url.hostname === YOUR_DOMAIN) {
            // Construct the target URL
            const targetUrl = `${targetURL.origin}${targetPath}${url.pathname}${url.search}`

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
                    // HTML - modify URLs carefully to preserve JSON
                    let body = await response.text()

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

                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)
                    newHeaders.set('Content-Type', contentType)

                    return new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })

                } else if (contentType.includes('text/css') ||
                    contentType.includes('application/javascript') ||
                    contentType.includes('text/javascript')) {
                    // CSS/JS - modify URLs but be careful
                    let body = await response.text()

                    // Only replace URL patterns, not arbitrary text
                    body = body.replace(new RegExp(`url\\(['"]?https://${targetUser}.wixsite.com${targetPath}`, 'g'), `url('https://${YOUR_DOMAIN}`)
                    body = body.replace(new RegExp(`src=['"]https://${targetUser}.wixsite.com${targetPath}`, 'g'), `src="https://${YOUR_DOMAIN}`)
                    body = body.replace(new RegExp(`href=['"]https://${targetUser}.wixsite.com${targetPath}`, 'g'), `href="https://${YOUR_DOMAIN}`)
                    // Fix TPA and navigation issues
                    body = body.replace(
                        /<script>/g,
                        `<script>
// Suppress TPA errors
const originalConsoleError = console.error;
console.error = function(...args) {
  if (args[0] && args[0].includes && args[0].includes('TPA message')) {
    return; // Suppress TPA errors
  }
  originalConsoleError.apply(console, args);
};

// Fix postMessage origin issues
const originalPostMessage = window.postMessage;
window.postMessage = function(message, targetOrigin, transfer) {
  if (targetOrigin && targetOrigin.includes('${targetHost}')) {
    targetOrigin = targetOrigin.replace('${targetHost}', '${YOUR_DOMAIN}');
  }
  return originalPostMessage.call(this, message, targetOrigin, transfer);
};
</script>
<script>`
                    )

                    newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)
                    newHeaders.set('Content-Type', contentType)

                    return new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    })

                } else {
                    // Everything else (images, fonts, etc.) - pass through unchanged
                    const newHeaders = fixHeaders(response.headers, YOUR_DOMAIN, targetHost, targetUser, targetPath)

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
