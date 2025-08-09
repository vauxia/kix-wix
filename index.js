export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
      // Construct the target URL
      const targetUrl = `https://allie2490.wixsite.com/welcome-cheetos${url.pathname}${url.search}`
      
      // Create new request with modified URL but same headers/method
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      })
      
      // Fetch from the target and return response
      const response = await fetch(modifiedRequest)
      
      // Create new response with modified headers if needed
      const newResponse = new Response(response.body, response)
      
      // Remove headers that might cause issues
      newResponse.headers.delete('x-frame-options')
      newResponse.headers.delete('content-security-policy')
      
      return newResponse
    
  }
}
