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
        
        // Modify text-based content (HTML, CSS, JS)
        if (contentType.includes('text/html') || 
            contentType.includes('text/css') || 
            contentType.includes('application/javascript') ||
            contentType.includes('text/javascript')) {
          
          let body = await response.text()
          
          // More comprehensive URL replacements
          // Replace full URLs
          body = body.replace(new RegExp(`https://${targetHost.replace(/\./g, '\\.')}${targetPath.replace(/\//g, '\\/')}`, 'g'), `https://${YOUR_DOMAIN}`)
          body = body.replace(new RegExp(`https://${targetHost.replace(/\./g, '\\.')}`, 'g'), `https://${YOUR_DOMAIN}`)
          
          // Replace relative URLs that include the path
          body = body.replace(new RegExp(targetPath.replace(/\//g, '\\/'), 'g'), '')
          
          // Replace domain references
          body = body.replace(new RegExp(targetHost.replace(/\./g, '\\.'), 'g'), YOUR_DOMAIN)
          
          // Handle specific Wix patterns
          body = body.replace(/\/welcome-cheetos\//g, '/')
          body = body.replace(/welcome-cheetos\//g, '')
          
          // Fix cookie domain issues
          body = body.replace(/domain=allie2490\.wixsite\.com/g, `domain=${YOUR_DOMAIN}`)
          body = body.replace(/Domain=allie2490\.wixsite\.com/g, `Domain=${YOUR_DOMAIN}`)
          
          // Create new headers
          const newHeaders = new Headers(response.headers)
          newHeaders.set('Content-Type', contentType)
          newHeaders.set('Access-Control-Allow-Origin', '*')
          newHeaders.delete('x-frame-options')
          newHeaders.delete('content-security-policy')
          newHeaders.delete('content-security-policy-report-only')
          newHeaders.delete('strict-transport-security')
          
          // Fix cookie domains in Set-Cookie headers
          const setCookieHeaders = newHeaders.getSetCookie?.() || []
          newHeaders.delete('set-cookie')
          setCookieHeaders.forEach(cookie => {
            const fixedCookie = cookie.replace(/Domain=allie2490\.wixsite\.com/gi, `Domain=${YOUR_DOMAIN}`)
            newHeaders.append('set-cookie', fixedCookie)
          })
          
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
        } else {
          // For binary files (images, fonts, etc.) - pass through unchanged
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
        }
        
      } catch (error) {
        return new Response('Proxy Error: ' + error.message, { status: 500 })
      }
    }
    
    // For other hostnames, return original request
    return fetch(request)
  }
}
