import { Env } from "./types"

const upstream = 'https://cdnjs.cloudflare.com'

interface KVMetadata {
	headers: Record<string, string>
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url)
		if (!url.pathname.startsWith('/ajax/libs/')) {
			return new Response('Not Found', { status: 404 })
		}
		const cache = caches.default
		const cached = await cache.match(request)
		if (cached) {
			console.log('using edge cache')
			return cached
		}

		const kvRes = await env.KVCACHE.getWithMetadata<KVMetadata>(url.pathname)
		let response: Response
		if (kvRes.value) {
			const headers = new Headers({
				'Cache-Control': 'public, max-age=30672000',
				'Cache-Control-Allow-Origin': '*'
			})
			console.log('using kv cache')
			if (kvRes.metadata) {
				for (const [key, value] of Object.entries(kvRes.metadata.headers)) {
					headers.set(key, value)
				}
			}
			response = new Response(kvRes.value, { headers })
		} else {
			console.log('using upstream')
			const upstreamRequest = new Request(upstream + url.pathname, request)
			response = await fetch(upstreamRequest)
			ctx.waitUntil(env.KVCACHE.put(url.pathname, await response.clone().arrayBuffer(), {
				metadata: {
					headers: {
						'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=30672000',
						'Cache-Control-Allow-Origin': '*'
					}
				},
			}))
		}

		ctx.waitUntil(cache.put(request, response.clone()))
		return response
	},
};
