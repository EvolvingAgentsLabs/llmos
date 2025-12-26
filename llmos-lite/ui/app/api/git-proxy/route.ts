/**
 * Git CORS Proxy API Route
 *
 * Proxies Git HTTP requests to GitHub, adding proper CORS headers.
 * This is necessary because GitHub's Git protocol doesn't support CORS.
 *
 * Security features:
 * - Only allows GitHub domains
 * - Rate limiting per IP
 * - Token forwarding (secure, never exposed to client)
 */

import { NextRequest, NextResponse } from 'next/server';

// Allowed GitHub domains
const ALLOWED_HOSTS = [
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'codeload.github.com'
];

// Simple in-memory rate limiting (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

/**
 * Check rate limit for an IP
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Validate target URL
 */
function validateUrl(urlString: string): URL | null {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return null;
    }

    // Check against allowed hosts
    if (!ALLOWED_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  response.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-GitHub-OTP');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

/**
 * Handle OPTIONS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return addCorsHeaders(new NextResponse(null, { status: 204 }));
}

/**
 * Handle all HTTP methods
 */
async function handleRequest(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request);

  // Check rate limit
  if (!checkRateLimit(clientIp)) {
    return addCorsHeaders(
      NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    );
  }

  // Get target URL from query parameter
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return addCorsHeaders(
      NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      )
    );
  }

  // Validate URL
  const validatedUrl = validateUrl(targetUrl);
  if (!validatedUrl) {
    return addCorsHeaders(
      NextResponse.json(
        { error: 'Invalid or disallowed URL' },
        { status: 403 }
      )
    );
  }

  try {
    // Build headers for upstream request
    const upstreamHeaders = new Headers();

    // Forward relevant headers
    const headersToForward = [
      'accept',
      'accept-encoding',
      'accept-language',
      'authorization',
      'content-type',
      'user-agent',
      'x-github-otp'
    ];

    for (const header of headersToForward) {
      const value = request.headers.get(header);
      if (value) {
        upstreamHeaders.set(header, value);
      }
    }

    // Prepare request options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    };

    // Include body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      fetchOptions.body = await request.arrayBuffer();
    }

    // Make request to GitHub
    const upstreamResponse = await fetch(validatedUrl.toString(), fetchOptions);

    // Get response body
    const body = await upstreamResponse.arrayBuffer();

    // Build response with CORS headers
    const response = new NextResponse(body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText
    });

    // Forward response headers
    const headersToReturn = [
      'content-type',
      'content-length',
      'content-encoding',
      'cache-control',
      'etag',
      'last-modified',
      'x-github-request-id',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-github-otp'
    ];

    for (const header of headersToReturn) {
      const value = upstreamResponse.headers.get(header);
      if (value) {
        response.headers.set(header, value);
      }
    }

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Git proxy error:', error);

    return addCorsHeaders(
      NextResponse.json(
        { error: 'Failed to proxy request', details: (error as Error).message },
        { status: 502 }
      )
    );
  }
}

// Export handlers for all methods
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
