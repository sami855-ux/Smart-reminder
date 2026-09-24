export type AuthPrincipal = {
  userId: string;
  sessionId: string;
};

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  jti: string;
  typ: 'access';
};
