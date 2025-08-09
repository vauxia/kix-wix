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
          // HTML - modify URLs
          let body = await response.text()
          
          // Replace URLs in HTML
          body = body.replace(new RegExp(`https://${targetHost.replace(/\./g, '\\.')}${targetPath.replace(/\//g, '\\/')}`, 'g'), `https://${YOUR_DOMAIN}`)
          body = body.replace(new RegExp(`https://${targetHost.replace(/\./g, '\\.')}`, 'g'), `https://${YOUR_DOMAIN}`)
          body = body.replace(new RegExp(targetPath.replace(/\//g, '\\/'), 'g'), '')
          body = body.replace(new RegExp(targetHost.replace(/\./g, '\\.'), 'g'), YOUR_DOMAIN)
          body = body.replace(/\/welcome-cheetos\//g, '/')
          body = body.replace(/welcome-cheetos\//g, '')
          
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
          // CSS/JS - modify URLs but be more careful
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
