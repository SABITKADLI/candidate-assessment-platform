import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Single Auth0 client for the recruiter app. Env vars expected (see .env.example):
//   AUTH0_SECRET, AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET,
//   APP_BASE_URL
export const auth0 = new Auth0Client();
