import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

interface TokenPayload {
  sub: string;
  email: string;
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
