import { Env } from "./types"

const upstream = 'https://cdnjs.cloudflare.com'

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url)
		const kvRes = await env.KVCACHE.getWithMetadata()
		return new Response("Hello World!")
	},
};
