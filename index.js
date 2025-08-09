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
        
        // Only modify HTML content, pass through everything else as-is
        if (contentType.includes('text/html')) {
          let body = await response.text()
          
          // Replace target domain references with your domain in the HTML
          body = body.replace(new RegExp(TARGET_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `https://${YOUR_DOMAIN}`)
          body = body.replace(new RegExp(targetHost + targetPath, 'g'), YOUR_DOMAIN)
          body = body.replace(new RegExp(targetPath + '/', 'g'), '/')
          
          // Create new headers object and explicitly set content-type
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Content-Type', contentType) // Preserve original content-type
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')
          
          // Return modified HTML with preserved content-type
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
        } else {
          // For CSS, JS, images, etc. - pass through unchanged
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
