const UPSTREAM = 'https://admin.best4fest.app'

function corsHeaders(request: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) })
    }

    const url = new URL(request.url)
    const targetUrl = `${UPSTREAM}${url.pathname}${url.search}`

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: { 'Content-Type': request.headers.get('Content-Type') ?? 'application/json' },
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
    })

    const response = new Response(upstreamResponse.body, upstreamResponse)
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      response.headers.set(key, value)
    }
    return response
  },
}
