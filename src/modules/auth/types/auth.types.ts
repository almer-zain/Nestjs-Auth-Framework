// auth.types.ts

export interface MfaTicketPayload {
  readonly sub: number;
  readonly purpose: 'mfa_validation';
}

export interface RefreshTokenPayload {
  readonly sub: number;
  readonly sid: string;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface MfaChallengeRequired {
  readonly mfaRequired: true;
  readonly mfaTicket: string;
}

export type LoginResult = AuthTokens | MfaChallengeRequired;

export interface GeneratedTwoFactorSecret {
  readonly secret: string;
  readonly qrCode: string;
  readonly uri: string;
}

export interface EnableTwoFactorResult {
  readonly message: string;
  readonly recoveryCodes: string[];
}

export interface VerificationResult {
  readonly message: string;
}
