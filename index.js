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
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')
          newHeaders.delete('content-security-policy-report-only')
          
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
          
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Content-Type', contentType)
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')
          newHeaders.delete('content-security-policy-report-only')
          
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
          body = body.replace(/url\(['"]?https:\/\/allie2490\.wixsite\.com\/welcome-cheetos/g, `url('https://${YOUR_DOMAIN}`)
          body = body.replace(/src=['"]https:\/\/allie2490\.wixsite\.com\/welcome-cheetos/g, `src="https://${YOUR_DOMAIN}`)
          body = body.replace(/href=['"]https:\/\/allie2490\.wixsite\.com\/welcome-cheetos/g, `href="https://${YOUR_DOMAIN}`)
          
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Content-Type', contentType)
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')

          // Fix cookie domains in Set-Cookie headers
// Fix cookie domains in Set-Cookie headers
if (response.headers.has('set-cookie')) {
  // Get all set-cookie headers (there can be multiple)
  const allSetCookieHeaders = []
  
  // Iterate through all headers to find set-cookie headers
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase() === 'set-cookie') {
      const fixedCookie = value
        .replace(/Domain=allie2490\.wixsite\.com/gi, `Domain=${YOUR_DOMAIN}`)
        .replace(/Domain=\.allie2490\.wixsite\.com/gi, `Domain=.${YOUR_DOMAIN}`)
        .replace(/Domain=wixsite\.com/gi, `Domain=${YOUR_DOMAIN}`)
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
          
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
          
        } else {
          // Everything else (images, fonts, etc.) - pass through unchanged
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')
          
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
        }
        
      } catch (error) {
        return new Response('Proxy Error: ' + error.message, { status: 500 })
      }
    }
    
    // For other hostnames, return original request
    return fetch(request)
  }
}
