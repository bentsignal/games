import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import {
  normalizeGoogleProfile,
  type GoogleProfile,
} from "@convex-dev/auth/providers/oauth/google";
import { setupOauth } from "@convex-dev/auth/providers/oauth/setup";
const core = setupCore({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = core;
// Auth v2's Google helper doesn't expose authorization parameters yet.
// Use the same Google catalog and profile mapping with an explicit account picker.
const google: ReturnType<typeof setupOauth<"google", GoogleProfile, "users">> =
  setupOauth<"google", GoogleProfile, "users">(
    core,
    "google",
    {
      authorizationEndpoint:
        "https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      scopes: ["openid", "email", "profile"],
      pkce: true,
      profile: normalizeGoogleProfile,
    },
    { createUser: internal.users.createUser },
    {
      component: components.oauthGoogle,
      allowedRedirectOrigins: [
        "https://games.bentsignal.local",
        "https://ticket.bentsignal.com",
        "https://games.bentsignal.com",
        ...(process.env.GAMES_DEV_WEB_ORIGIN
          ? [process.env.GAMES_DEV_WEB_ORIGIN]
          : []),
      ],
    },
  );

export const {
  startSignIn: startSignInGoogle,
  completeSignIn: completeSignInGoogle,
} = google;
