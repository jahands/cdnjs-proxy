import pRetry from 'p-retry';

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
		const cached = await pRetry(() => cache.match(request), { retries: 5, minTimeout: 300 })
		if (cached) {
			console.log('using edge cache')
			return cached
		}

		const kvRes = await pRetry(() =>
			env.KVCACHE.getWithMetadata<KVMetadata>(url.pathname),
			{ retries: 5, minTimeout: 300 })

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
			if (response.ok) {
				const headers: Record<string, string> = {
					'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=30672000',
					'Cache-Control-Allow-Origin': '*'
				}
				const contentType = response.headers.get('Content-Type')
				if (contentType) {
					headers['Content-Type'] = contentType
				}
				const etag = response.headers.get('ETag')
				if (etag) {
					headers['ETag'] = etag
				}
				ctx.waitUntil(env.KVCACHE.put(url.pathname, await response.clone().arrayBuffer(), {
					metadata: {
						headers
					},
				}))
			}
		}
		if (response.ok) {
			ctx.waitUntil(cache.put(request, response.clone()))
		}
		return response
	},
};
