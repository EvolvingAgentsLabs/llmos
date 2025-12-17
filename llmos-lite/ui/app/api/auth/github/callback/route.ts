import { NextRequest, NextResponse } from 'next/server';

/**
 * GitHub OAuth Callback Handler
 * Exchanges authorization code for access token
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?auth_error=missing_code', request.url)
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Get user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const userData = await userResponse.json();

    // Get user email if not public
    let email = userData.email;
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || `${userData.login}@users.noreply.github.com`;
      }
    }

    const user = {
      id: userData.id,
      login: userData.login,
      name: userData.name || userData.login,
      email: email || `${userData.login}@users.noreply.github.com`,
      avatar_url: userData.avatar_url,
      access_token: accessToken,
    };

    // Create HTML response that posts message to parent window
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authentication</title>
        </head>
        <body>
          <script>
            window.opener.postMessage(
              { type: 'github_auth_success', user: ${JSON.stringify(user)} },
              window.location.origin
            );
            window.close();
          </script>
          <p>Authentication successful! This window will close automatically...</p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('GitHub OAuth error:', error);

    return NextResponse.redirect(
      new URL(
        `/?auth_error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`,
        request.url
      )
    );
  }
}
